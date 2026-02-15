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
  const params = new URLSearchParams({
    access_token: pageAccessToken,
    title: title.slice(0, 255),
    description: (description || "").slice(0, 5000),
    file_url: signedUrl,
  });

  // Add thumbnail if provided
  if (thumbnailBucket && thumbnailPath) {
    try {
      const thumbUrl = await getSignedDownloadUrl({ bucket: thumbnailBucket, path: thumbnailPath });
      params.set("thumb", thumbUrl);
    } catch (e: any) {
      console.error("[Facebook] Thumbnail URL failed, posting without thumbnail:", e?.message);
    }
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/videos`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
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
