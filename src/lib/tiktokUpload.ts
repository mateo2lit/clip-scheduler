import { supabaseAdmin } from "./supabaseAdmin";
import { getTikTokAccessToken } from "./tiktok";

type UploadToTikTokArgs = {
  userId: string;
  platformAccountId: string;
  refreshToken: string;
  accessToken?: string | null;
  expiresAt?: string | null;

  bucket: string;
  storagePath: string;

  title: string;
  privacyLevel?: string;
  allowComments?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  brandOrganicToggle?: boolean;
  brandContentToggle?: boolean;
};

function assertOk(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function getSignedDownloadUrl(params: {
  bucket: string;
  path: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { bucket, path, expiresInSeconds = 60 * 60 } = params; // 1 hour — TikTok needs time to fetch

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message || "unknown error"}`);
  }

  return data.signedUrl;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadSupabaseVideoToTikTok(args: UploadToTikTokArgs): Promise<{
  publishId: string;
}> {
  const {
    userId,
    platformAccountId,
    refreshToken,
    accessToken: existingAccessToken,
    expiresAt: existingExpiresAt,
    bucket,
    storagePath,
    title,
    privacyLevel = "PUBLIC_TO_EVERYONE",
    allowComments = false,
    allowDuet = false,
    allowStitch = false,
    brandOrganicToggle = false,
    brandContentToggle = false,
  } = args;

  assertOk(refreshToken, "Missing refreshToken");
  assertOk(bucket, "Missing bucket");
  assertOk(storagePath, "Missing storagePath");
  assertOk(title, "Missing title");

  // 1) Get fresh access token
  const tokens = await getTikTokAccessToken({
    refreshToken,
    accessToken: existingAccessToken,
    expiresAt: existingExpiresAt,
  });

  // Persist refreshed tokens
  await supabaseAdmin
    .from("platform_accounts")
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry: tokens.expiresAt.toISOString(),
    })
    .eq("id", platformAccountId)
    .eq("user_id", userId);

  // 2) Create signed URL — TikTok fetches the video directly from Supabase (PULL_FROM_URL).
  //    This avoids routing large files through the Vercel function entirely.
  const signedUrl = await getSignedDownloadUrl({ bucket, path: storagePath });

  // TikTok requires video_size, chunk_size, and total_chunk_count even for PULL_FROM_URL.
  // Fetch the file size via a HEAD request on the signed URL.
  let videoSize = 0;
  try {
    const headRes = await fetch(signedUrl, { method: "HEAD" });
    const contentLength = headRes.headers.get("content-length");
    if (contentLength) videoSize = parseInt(contentLength, 10);
  } catch {
    // Non-fatal — proceed with 0 and let TikTok reject if truly required
  }

  // 3) Initialize TikTok publish via /v2/post/publish/video/init/
  const initRes = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: title.slice(0, 2200),
          privacy_level: privacyLevel,
          disable_comment: !allowComments,
          disable_duet: !allowDuet,
          disable_stitch: !allowStitch,
          brand_organic_toggle: brandOrganicToggle,
          brand_content_toggle: brandContentToggle,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: signedUrl,
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1,
        },
      }),
    }
  );

  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`TikTok upload init failed: ${initRes.status} ${text}`);
  }

  const initData = await initRes.json();

  if (initData.error?.code && initData.error.code !== "ok") {
    throw new Error(
      `TikTok upload init error: ${initData.error.code} - ${initData.error.message}`
    );
  }

  const publishId = initData.data?.publish_id;

  if (!publishId) {
    throw new Error("TikTok upload init did not return publish_id");
  }

  // 4) Poll /v2/post/publish/status/fetch/ until TikTok finishes fetching and processing
  const maxPolls = 30;
  const pollInterval = 5000;

  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollInterval);

    const statusRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
      }
    );

    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    const status = statusData.data?.status;

    if (status === "PUBLISH_COMPLETE") {
      return { publishId };
    }

    if (status === "FAILED") {
      const failReason = statusData.data?.fail_reason || "Unknown reason";
      throw new Error(`TikTok publish failed: ${failReason}`);
    }

    // PROCESSING_UPLOAD or PROCESSING_DOWNLOAD - keep polling
  }

  // Exhausted polls — TikTok may still be processing in the background
  return { publishId };
}
