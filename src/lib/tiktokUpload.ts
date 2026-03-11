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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB per chunk (TikTok maximum)

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

  // 2) Get video size and a signed URL for range requests.
  //    TikTok's PULL_FROM_URL requires verified domain ownership (supabase.co is not verifiable),
  //    so we use FILE_UPLOAD and stream each chunk via HTTP range requests — only 10 MB in memory at a time.
  const { data: uploadRecord } = await supabaseAdmin
    .from("uploads")
    .select("file_size")
    .eq("file_path", storagePath)
    .maybeSingle();

  // Get a signed URL for range-based fetching from Supabase
  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60);

  if (signedError || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signedError?.message ?? "unknown"}`);
  }

  const signedUrl = signedData.signedUrl;

  // Determine video size: prefer DB record, fall back to HEAD request
  let videoSize = uploadRecord?.file_size ? Number(uploadRecord.file_size) : 0;
  if (!videoSize) {
    const headRes = await fetch(signedUrl, { method: "HEAD" });
    const cl = headRes.headers.get("content-length");
    if (cl) videoSize = parseInt(cl, 10);
  }

  if (!videoSize) {
    throw new Error("Could not determine video file size");
  }

  // Chunk sizing: single chunk if file fits in one, otherwise 10 MB chunks
  const chunkSize = videoSize <= CHUNK_SIZE ? videoSize : CHUNK_SIZE;
  const totalChunks = Math.ceil(videoSize / chunkSize);

  // Detect MIME type from file extension
  const ext = storagePath.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4";

  // 3) Initialize TikTok FILE_UPLOAD publish
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
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: totalChunks,
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
    throw new Error(`TikTok upload init error: ${initData.error.code} - ${initData.error.message}`);
  }

  const uploadUrl = initData.data?.upload_url;
  const publishId = initData.data?.publish_id;

  if (!uploadUrl || !publishId) {
    throw new Error("TikTok upload init did not return upload_url or publish_id");
  }

  // 4) Upload chunks — stream from Supabase via range requests, never load full file into memory
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, videoSize);
    const thisChunkSize = end - start;

    // Fetch just this chunk from Supabase
    const rangeRes = await fetch(signedUrl, {
      headers: { Range: `bytes=${start}-${end - 1}` },
    });

    if (!rangeRes.ok && rangeRes.status !== 206) {
      throw new Error(`Failed to fetch chunk ${i + 1}/${totalChunks} from storage: ${rangeRes.status}`);
    }

    const chunkBuffer = Buffer.from(await rangeRes.arrayBuffer());

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end - 1}/${videoSize}`,
        "Content-Length": String(thisChunkSize),
      },
      body: chunkBuffer,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`TikTok chunk ${i + 1}/${totalChunks} upload failed: ${uploadRes.status} ${text}`);
    }
  }

  // 5) Poll /v2/post/publish/status/fetch/ until TikTok finishes processing
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

    // PROCESSING_UPLOAD or PROCESSING_DOWNLOAD — keep polling
  }

  // Exhausted polls — TikTok may still be processing in the background
  return { publishId };
}
