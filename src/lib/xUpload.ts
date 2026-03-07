import { supabaseAdmin } from "./supabaseAdmin";
import { buildOAuth1Header, getXConsumerKeys } from "./xOAuth1";

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
  accessTokenSecret,
  bucket,
  storagePath,
  text,
  replySettings = "everyone",
}: {
  platformAccountId: string;
  accessToken: string;
  accessTokenSecret: string;
  bucket: string;
  storagePath: string;
  text: string;
  replySettings?: "everyone" | "mentionedUsers" | "subscribers";
}): Promise<{ tweetId: string }> {
  const { apiKey, apiSecret } = getXConsumerKeys();

  function oauth1Header(
    method: string,
    url: string,
    extraSignedParams?: Record<string, string>,
    oauthVerifier?: string
  ) {
    return buildOAuth1Header(method, url, apiKey, apiSecret, {
      accessToken,
      accessTokenSecret,
      extraSignedParams,
      oauthVerifier,
    });
  }

  // 1. Download video from Supabase storage
  const signedUrl = await getSignedDownloadUrl(bucket, storagePath);
  const videoRes = await fetch(signedUrl);
  if (!videoRes.ok) throw new Error("Failed to download video from storage");
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const totalBytes = videoBuffer.length;

  const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload";

  // 2. INIT — URL-encoded form, params included in OAuth signature
  const initParams = {
    command: "INIT",
    total_bytes: String(totalBytes),
    media_type: "video/mp4",
    media_category: "tweet_video",
  };
  const initRes = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: oauth1Header("POST", UPLOAD_URL, initParams),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(initParams).toString(),
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new Error(`X media init failed: ${initRes.status} ${t}`);
  }
  const initData = await initRes.json();
  const mediaId: string = initData?.media_id_string ?? String(initData?.media_id ?? "");
  if (!mediaId) throw new Error("X media upload did not return a media ID");

  // 3. APPEND — multipart body; OAuth signature covers only oauth params (not multipart fields)
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const chunk = videoBuffer.slice(start, Math.min(start + CHUNK_SIZE, totalBytes));
    const form = new FormData();
    form.append("command", "APPEND");
    form.append("media_id", mediaId);
    form.append("segment_index", String(i));
    form.append("media", new Blob([chunk], { type: "application/octet-stream" }));
    const appendRes = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: oauth1Header("POST", UPLOAD_URL) },
      body: form,
    });
    if (!appendRes.ok) {
      const t = await appendRes.text();
      throw new Error(`X media append chunk ${i} failed: ${appendRes.status} ${t}`);
    }
  }

  // 4. FINALIZE — URL-encoded form, params included in OAuth signature
  const finalizeParams = { command: "FINALIZE", media_id: mediaId };
  const finalizeRes = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: oauth1Header("POST", UPLOAD_URL, finalizeParams),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(finalizeParams).toString(),
  });
  if (!finalizeRes.ok) {
    const t = await finalizeRes.text();
    throw new Error(`X media finalize failed: ${finalizeRes.status} ${t}`);
  }
  const finalizeData = await finalizeRes.json();

  // 5. Poll STATUS until processing is complete
  let processingState: string | undefined = finalizeData?.processing_info?.state;
  let attempts = 0;
  while (processingState === "pending" || processingState === "in_progress") {
    if (attempts++ > 30) throw new Error("X video processing timed out");
    await new Promise((r) => setTimeout(r, 5_000));
    const statusParams = { command: "STATUS", media_id: mediaId };
    const statusRes = await fetch(`${UPLOAD_URL}?command=STATUS&media_id=${mediaId}`, {
      headers: { Authorization: oauth1Header("GET", UPLOAD_URL, statusParams) },
    });
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      processingState = statusData?.processing_info?.state;
      if (processingState === "failed") {
        throw new Error(
          `X video processing failed: ${statusData?.processing_info?.error?.message ?? "unknown"}`
        );
      }
    } else {
      break;
    }
  }

  // 6. Post tweet — JSON body, only oauth params in signature
  const tweetText = text.slice(0, 280);
  const tweetUrl = "https://api.x.com/2/tweets";
  const tweetRes = await fetch(tweetUrl, {
    method: "POST",
    headers: {
      Authorization: oauth1Header("POST", tweetUrl),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: tweetText,
      media: { media_ids: [mediaId] },
      reply_settings: replySettings,
    }),
  });

  if (!tweetRes.ok) {
    const t = await tweetRes.text();
    throw new Error(`X tweet post failed: ${tweetRes.status} ${t}`);
  }

  const tweetData = await tweetRes.json();
  const tweetId: string = tweetData?.data?.id;
  if (!tweetId) throw new Error("X tweet post did not return a tweet ID");

  return { tweetId };
}
