import { supabaseAdmin } from "./supabaseAdmin";
import { getXAccessToken } from "./x";

type UploadToXArgs = {
  userId: string;
  platformAccountId: string;
  refreshToken: string;
  accessToken?: string | null;
  expiresAt?: string | null;

  bucket: string;
  storagePath: string;

  tweetText: string;
  replySettings?: "everyone" | "mentionedUsers" | "subscribers";
};

function assertOk(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB chunks
const MEDIA_UPLOAD_BASE = "https://api.x.com/2/media/upload";

export async function uploadVideoToX(args: UploadToXArgs): Promise<{
  tweetId: string;
}> {
  const {
    userId,
    platformAccountId,
    refreshToken,
    accessToken: existingAccessToken,
    expiresAt: existingExpiresAt,
    bucket,
    storagePath,
    tweetText,
    replySettings = "everyone",
  } = args;

  assertOk(refreshToken, "Missing refreshToken");
  assertOk(bucket, "Missing bucket");
  assertOk(storagePath, "Missing storagePath");

  // 1) Get fresh access token
  const tokens = await getXAccessToken({
    refreshToken,
    accessToken: existingAccessToken,
    expiresAt: existingExpiresAt,
  });

  const accessToken = tokens.accessToken;

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

  // 2) Download video bytes from Supabase storage
  const { data: signedData, error: signedErr } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(storagePath, 120);

  if (signedErr || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signedErr?.message || "unknown"}`);
  }

  const videoRes = await fetch(signedData.signedUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to download video from storage: ${videoRes.status}`);
  }

  const videoBuffer = await videoRes.arrayBuffer();
  const totalBytes = videoBuffer.byteLength;

  assertOk(totalBytes > 0, "Video file is empty");

  // 3) INIT the media upload
  const initRes = await fetch(`${MEDIA_UPLOAD_BASE}/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      total_bytes: totalBytes,
      media_type: "video/mp4",
      media_category: "tweet_video",
    }),
  });

  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`X media INIT failed: ${initRes.status} ${text}`);
  }

  const initData = await initRes.json();
  const mediaId: string = initData.data?.id;

  if (!mediaId) {
    throw new Error("X media INIT did not return media id");
  }

  // 4) APPEND chunks
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalBytes);
    const chunk = videoBuffer.slice(start, end);

    const appendForm = new FormData();
    appendForm.append("segment_index", String(i));
    appendForm.append("media", new Blob([chunk], { type: "video/mp4" }));

    const appendRes = await fetch(`${MEDIA_UPLOAD_BASE}/${mediaId}/append`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: appendForm,
    });

    if (!appendRes.ok) {
      const text = await appendRes.text();
      throw new Error(`X media APPEND (segment ${i}) failed: ${appendRes.status} ${text}`);
    }
  }

  // 5) FINALIZE
  const finalizeRes = await fetch(`${MEDIA_UPLOAD_BASE}/${mediaId}/finalize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!finalizeRes.ok) {
    const text = await finalizeRes.text();
    throw new Error(`X media FINALIZE failed: ${finalizeRes.status} ${text}`);
  }

  const finalizeData = await finalizeRes.json();

  // 6) Poll for processing completion if needed
  const initialProcessingInfo = finalizeData.data?.processing_info ?? finalizeData.processing_info;
  if (initialProcessingInfo) {
    let processingInfo = initialProcessingInfo;
    const startTime = Date.now();
    const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes

    while (processingInfo.state !== "succeeded") {
      if (processingInfo.state === "failed") {
        const errMsg = processingInfo.error?.message || "Unknown processing error";
        throw new Error(`X media processing failed: ${errMsg}`);
      }

      if (Date.now() - startTime > MAX_WAIT_MS) {
        throw new Error("X media processing timed out after 5 minutes");
      }

      const waitSecs = processingInfo.check_after_secs ?? 5;
      await sleep(waitSecs * 1000);

      const statusRes = await fetch(
        `${MEDIA_UPLOAD_BASE}?media_id=${mediaId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!statusRes.ok) {
        const text = await statusRes.text();
        throw new Error(`X media STATUS check failed: ${statusRes.status} ${text}`);
      }

      const statusData = await statusRes.json();
      processingInfo = statusData.data?.processing_info ?? statusData.processing_info;

      if (!processingInfo) {
        // No processing_info in response means it's done
        break;
      }
    }
  }

  // 7) Post the tweet
  const tweetBody: any = {
    text: tweetText.slice(0, 280),
    media: { media_ids: [mediaId] },
  };

  if (replySettings !== "everyone") {
    tweetBody.reply_settings = replySettings;
  }

  const tweetRes = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tweetBody),
  });

  if (!tweetRes.ok) {
    const text = await tweetRes.text();
    throw new Error(`X tweet post failed: ${tweetRes.status} ${text}`);
  }

  const tweetData = await tweetRes.json();
  const tweetId: string = tweetData.data?.id;

  if (!tweetId) {
    throw new Error("X tweet post did not return tweet id");
  }

  return { tweetId };
}
