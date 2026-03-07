import { supabaseAdmin } from "./supabaseAdmin";

export function getXAuthConfig() {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const siteUrl =
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!clientId || !clientSecret || !siteUrl) {
    throw new Error("Missing X_CLIENT_ID / X_CLIENT_SECRET / SITE_URL env vars");
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${siteUrl}/api/auth/x/callback`,
  };
}

export async function refreshXToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const { clientId, clientSecret } = getXAuthConfig();

  const res = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`X token refresh error: ${data.error_description || data.error}`);
  }

  return data;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

async function getSignedDownloadUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 30);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

export async function uploadVideoToX({
  platformAccountId,
  accessToken,
  refreshToken,
  expiresAt,
  bucket,
  storagePath,
  text,
  replySettings = "everyone",
}: {
  platformAccountId: string;
  accessToken: string | null;
  refreshToken: string;
  expiresAt: string | null;
  bucket: string;
  storagePath: string;
  text: string;
  replySettings?: "everyone" | "mentionedUsers" | "subscribers";
}): Promise<{ tweetId: string }> {
  // Refresh token if expired or missing
  let token = accessToken;
  const expiry = expiresAt ? new Date(expiresAt).getTime() : 0;
  if (!token || Date.now() >= expiry - 60_000) {
    const refreshed = await refreshXToken(refreshToken);
    token = refreshed.access_token;
    await supabaseAdmin
      .from("platform_accounts")
      .update({
        access_token: token,
        refresh_token: refreshed.refresh_token,
        expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", platformAccountId);
  }

  const authHeader = `Bearer ${token}`;

  // 1. Download video from Supabase storage
  const signedUrl = await getSignedDownloadUrl(bucket, storagePath);
  const videoRes = await fetch(signedUrl);
  if (!videoRes.ok) throw new Error("Failed to download video from storage");
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const totalBytes = videoBuffer.length;

  // 2–5. Upload media via v1.1 chunked upload (works on free tier; v2 media endpoint requires Basic)
  const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload";

  // INIT
  const initForm = new URLSearchParams({
    command: "INIT",
    total_bytes: String(totalBytes),
    media_type: "video/mp4",
    media_category: "tweet_video",
  });
  const initRes = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
    body: initForm.toString(),
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new Error(`X media init failed: ${initRes.status} ${t}`);
  }
  const initData = await initRes.json();
  const mediaId: string = initData?.media_id_string ?? String(initData?.media_id ?? "");
  if (!mediaId) throw new Error("X media upload did not return a media ID");

  // APPEND chunks
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const chunk = videoBuffer.slice(start, Math.min(start + CHUNK_SIZE, totalBytes));
    const appendForm = new FormData();
    appendForm.append("command", "APPEND");
    appendForm.append("media_id", mediaId);
    appendForm.append("segment_index", String(i));
    appendForm.append("media", new Blob([chunk], { type: "application/octet-stream" }));
    const appendRes = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: appendForm,
    });
    if (!appendRes.ok) {
      const t = await appendRes.text();
      throw new Error(`X media append chunk ${i} failed: ${appendRes.status} ${t}`);
    }
  }

  // FINALIZE
  const finalizeForm = new URLSearchParams({ command: "FINALIZE", media_id: mediaId });
  const finalizeRes = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
    body: finalizeForm.toString(),
  });
  if (!finalizeRes.ok) {
    const t = await finalizeRes.text();
    throw new Error(`X media finalize failed: ${finalizeRes.status} ${t}`);
  }
  const finalizeData = await finalizeRes.json();

  // Poll STATUS until ready
  let processingState: string | undefined = finalizeData?.processing_info?.state;
  let attempts = 0;
  while (processingState === "pending" || processingState === "in_progress") {
    if (attempts++ > 30) throw new Error("X video processing timed out");
    await new Promise((r) => setTimeout(r, 5_000));
    const statusRes = await fetch(`${UPLOAD_URL}?command=STATUS&media_id=${mediaId}`, {
      headers: { Authorization: authHeader },
    });
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      processingState = statusData?.processing_info?.state;
      if (processingState === "failed") {
        throw new Error(`X video processing failed: ${statusData?.processing_info?.error?.message ?? "unknown"}`);
      }
    } else {
      break;
    }
  }
  // 6. Post tweet with video — truncate text to 280 chars
  const tweetText = text.slice(0, 280);

  // Request author expansion so we can capture profile info on free tier
  const tweetRes = await fetch(
    "https://api.x.com/2/tweets?expansions=author_id&user.fields=name,username,profile_image_url",
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: tweetText,
        media: { media_ids: [mediaId] },
        reply_settings: replySettings,
      }),
    }
  );

  if (!tweetRes.ok) {
    const t = await tweetRes.text();
    throw new Error(`X tweet post failed: ${tweetRes.status} ${t}`);
  }

  const tweetData = await tweetRes.json();
  const tweetId: string = tweetData?.data?.id;
  if (!tweetId) throw new Error("X tweet post did not return a tweet ID");

  // Opportunistically save profile info from tweet response (free tier workaround)
  try {
    const author = tweetData?.includes?.users?.[0];
    if (author?.name || author?.username) {
      const profileName = author.name || `@${author.username}`;
      const rawAvatar: string | undefined = author.profile_image_url;
      const avatarUrl = rawAvatar ? rawAvatar.replace("_normal", "_400x400") : null;
      const { data: acctRow } = await supabaseAdmin
        .from("platform_accounts")
        .select("profile_name")
        .eq("id", platformAccountId)
        .maybeSingle();
      // Only update if profile_name is currently missing
      if (!acctRow?.profile_name) {
        await supabaseAdmin
          .from("platform_accounts")
          .update({
            profile_name: profileName,
            label: profileName,
            platform_user_id: author.id ?? null,
            ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", platformAccountId);
      }
    }
  } catch {
    // Non-fatal
  }

  return { tweetId };
}
