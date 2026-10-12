import { supabaseAdmin } from "./supabaseAdmin";

type UploadToFacebookArgs = {
  userId: string;
  platformAccountId: string;
  pageId: string;
  pageAccessToken: string;

  bucket: string;
  storagePath: string;

  title: string;
  description?: string;

  thumbnailBucket?: string;
  thumbnailPath?: string;
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

async function downloadToBuffer(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .download(path);

  if (error || !data) {
    throw new Error(`Failed to download file: ${error?.message || "unknown error"}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function uploadSupabaseVideoToFacebook(args: UploadToFacebookArgs): Promise<{
  facebookVideoId: string;
}> {
  const {
    userId,
    platformAccountId,
    pageId,
    pageAccessToken,
    bucket,
    storagePath,
    title,
    description,
    thumbnailBucket,
    thumbnailPath,
  } = args;

  assertOk(pageId, "Missing pageId");
  assertOk(pageAccessToken, "Missing pageAccessToken");
  assertOk(bucket, "Missing bucket");
  assertOk(storagePath, "Missing storagePath");
  assertOk(title, "Missing title");

  // 1) Create signed URL for the video file
  const signedUrl = await getSignedDownloadUrl({ bucket, path: storagePath });

  // 2) POST to Facebook Page Videos API with file_url
  // Use FormData so we can attach thumbnail as binary if needed
  const form = new FormData();
  form.append("access_token", pageAccessToken);
  form.append("title", title.slice(0, 255));
  form.append("description", (description || "").slice(0, 5000));
  form.append("file_url", signedUrl);

  // Add thumbnail as binary data if provided (Facebook requires image file data, not a URL)
  if (thumbnailBucket && thumbnailPath) {
    try {
      const thumbBuffer = await downloadToBuffer(thumbnailBucket, thumbnailPath);
      const ext = thumbnailPath.split(".").pop()?.toLowerCase() || "jpg";
      const mimeType = ext === "png" ? "image/png" : "image/jpeg";
      form.append("thumb", new Blob([new Uint8Array(thumbBuffer)], { type: mimeType }), `thumbnail.${ext}`);
    } catch (e: any) {
      console.error("[Facebook] Thumbnail download failed, posting without thumbnail:", e?.message);
    }
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/videos`,
    {
      method: "POST",
      body: form,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Facebook video upload failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`Facebook upload error: ${data.error.message}`);
  }

  const facebookVideoId = data.id;
  if (!facebookVideoId) {
    throw new Error("Facebook upload succeeded but no video ID was returned");
  }

  return { facebookVideoId };
}

// ── Reels ───────────────────────────────────────────────────────────────────
//
// Reels go through their own endpoint (/{page-id}/video_reels): start a session, let
// Meta pull the file from a signed URL (nothing is buffered here), then finish with
// video_state=PUBLISHED. Meta processes and publishes asynchronously, so the worker
// marks the post as processing and checks back with checkFacebookReel on later runs.
// Same permissions as Page videos (pages_manage_posts). Reels must be 3-90 seconds.

type StartFacebookReelArgs = {
  pageId: string;
  pageAccessToken: string;
  bucket: string;
  storagePath: string;
  title?: string;
  description?: string;
};

async function graphJson(res: Response, what: string): Promise<any> {
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    // handled below
  }
  if (!res.ok || !data || data.error) {
    throw new Error(`${what}: ${res.status} ${data?.error?.message || text}`);
  }
  return data;
}

export async function startFacebookReel(args: StartFacebookReelArgs): Promise<{ videoId: string }> {
  const { pageId, pageAccessToken, bucket, storagePath, title, description } = args;
  assertOk(pageId, "Missing pageId");
  assertOk(pageAccessToken, "Missing pageAccessToken");

  // 1) Start an upload session
  const start = await graphJson(
    await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_phase: "start", access_token: pageAccessToken }),
    }),
    "Facebook Reel start failed"
  );
  const videoId: string | undefined = start.video_id;
  assertOk(videoId, "Facebook Reel start returned no video_id");

  // 2) Meta pulls the file from storage. An hour covers slow fetches of large files.
  const signedUrl = await getSignedDownloadUrl({ bucket, path: storagePath, expiresInSeconds: 60 * 60 });
  await graphJson(
    await fetch(`https://rupload.facebook.com/video-upload/v21.0/${videoId}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${pageAccessToken}`, file_url: signedUrl },
    }),
    "Facebook Reel upload failed"
  );

  // 3) Finish and publish
  const params = new URLSearchParams({
    access_token: pageAccessToken,
    video_id: videoId,
    upload_phase: "finish",
    video_state: "PUBLISHED",
  });
  if (title?.trim()) params.set("title", title.trim().slice(0, 255));
  if (description?.trim()) params.set("description", description.trim().slice(0, 5000));
  await graphJson(
    await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    }),
    "Facebook Reel publish failed"
  );

  return { videoId };
}

export type FacebookReelStatus =
  | { status: "processing" }
  | { status: "posted" }
  | { status: "failed"; error: string };

/** Reads a Reel's status. Published means done; any phase error means it failed. */
export function readFacebookReelStatus(body: any): FacebookReelStatus {
  const st = body?.status ?? {};
  const phases = [st.uploading_phase, st.processing_phase, st.publishing_phase];
  const phaseError = phases.find((p) => p?.status === "error");
  if (st.video_status === "error" || st.video_status === "upload_failed" || st.video_status === "expired" || phaseError) {
    const message = phaseError?.error?.message || phaseError?.errors?.[0]?.message || st.video_status || "unknown reason";
    return { status: "failed", error: `Facebook couldn't publish the Reel: ${message}` };
  }
  const pub = st.publishing_phase ?? {};
  if (pub.publish_status === "published" || pub.status === "complete" || pub.status === "completed") {
    return { status: "posted" };
  }
  return { status: "processing" };
}

export async function checkFacebookReel(videoId: string, pageAccessToken: string): Promise<FacebookReelStatus> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${videoId}?fields=status&access_token=${encodeURIComponent(pageAccessToken)}`
  );
  // A 5xx is Meta having a bad moment; the next worker run checks again.
  if (res.status >= 500) return { status: "processing" };
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    return { status: "failed", error: `Facebook Reel check failed: ${res.status} ${body?.error?.message || ""}`.trim() };
  }
  return readFacebookReelStatus(body);
}

// ── Text-only post ────────────────────────────────────────────────────────────

type PostTextToFacebookArgs = {
  pageId: string;
  pageAccessToken: string;
  message: string; // max 63206 chars
  linkUrl?: string; // Facebook auto-generates link preview server-side
};

/**
 * Publish a text-only (or text + link) post to a Facebook Page.
 * No video upload required.
 */
export async function postTextToFacebook(args: PostTextToFacebookArgs): Promise<{
  facebookPostId: string;
}> {
  const { pageId, pageAccessToken, message, linkUrl } = args;

  assertOk(pageId, "Missing pageId");
  assertOk(pageAccessToken, "Missing pageAccessToken");
  assertOk(message, "Missing message");

  const params: Record<string, string> = {
    message: message.slice(0, 63206),
    access_token: pageAccessToken,
  };

  if (linkUrl) {
    params.link = linkUrl;
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Facebook text post failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`Facebook text post error: ${data.error.message}`);
  }

  const facebookPostId = data.id;
  if (!facebookPostId) {
    throw new Error("Facebook text post succeeded but no post ID returned");
  }

  return { facebookPostId };
}
