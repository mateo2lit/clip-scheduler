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
  const { bucket, path, expiresInSeconds = 60 * 15 } = params;

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message || "unknown error"}`);
  }

  return data.signedUrl;
}

async function getVideoFileSize(url: string): Promise<number> {
  const res = await fetch(url, { method: "HEAD" });
  const contentLength = res.headers.get("content-length");
  if (!contentLength) {
    throw new Error("Could not determine video file size from signed URL");
  }
  return parseInt(contentLength, 10);
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
    privacyLevel = "SELF_ONLY",
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

  // 2) Create signed URL for the video file
  const signedUrl = await getSignedDownloadUrl({ bucket, path: storagePath });

  // 3) Get file size for TikTok upload init
  const fileSize = await getVideoFileSize(signedUrl);

  // 4) Initialize TikTok upload via /v2/post/publish/video/init/
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
          source: "FILE_UPLOAD",
          video_size: fileSize,
          chunk_size: fileSize,
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

  const uploadUrl = initData.data?.upload_url;
  const publishId = initData.data?.publish_id;

  if (!uploadUrl || !publishId) {
    throw new Error("TikTok upload init did not return upload_url or publish_id");
  }

  // 5) Download video and upload to TikTok's upload_url
  const videoRes = await fetch(signedUrl);
  if (!videoRes.ok || !videoRes.body) {
    throw new Error(
      `Failed to fetch video from signed URL. status=${videoRes.status}`
    );
  }

  const videoBuffer = await videoRes.arrayBuffer();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`,
      "Content-Length": String(fileSize),
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`TikTok video upload failed: ${uploadRes.status} ${text}`);
  }

  // 6) Poll /v2/post/publish/status/fetch/ until complete
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

  // If we exhausted polls, return the publish_id anyway - TikTok may still be processing
  return { publishId };
}
