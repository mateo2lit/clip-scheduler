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
