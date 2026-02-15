import { supabaseAdmin } from "./supabaseAdmin";

type UploadToLinkedInArgs = {
  userId: string;
  platformAccountId: string;
  accessToken: string;
  personUrn: string; // "urn:li:person:{id}"

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

/**
 * Upload a video to LinkedIn using the Video API.
 *
 * Flow:
 * 1. Download video from Supabase
 * 2. Initialize upload — register the video with LinkedIn (get upload URLs + video URN)
 * 3. Upload binary parts — PUT each chunk to LinkedIn's upload URLs (collect ETags)
 * 4. Finalize upload — link all parts together
 * 5. Create post — publish the video with text
 */
export async function uploadSupabaseVideoToLinkedIn(args: UploadToLinkedInArgs): Promise<{
  linkedinPostId: string;
}> {
  const {
    userId,
    platformAccountId,
    accessToken,
    personUrn,
    bucket,
    storagePath,
    title,
    description,
    thumbnailBucket,
    thumbnailPath,
  } = args;

  assertOk(accessToken, "Missing accessToken");
  assertOk(personUrn, "Missing personUrn");
  assertOk(bucket, "Missing bucket");
  assertOk(storagePath, "Missing storagePath");
  assertOk(title, "Missing title");

  const apiHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": "202601",
    "X-Restli-Protocol-Version": "2.0.0",
  };

  // 1) Download video from Supabase first (need file size for init)
  const signedUrl = await getSignedDownloadUrl({ bucket, path: storagePath });
  const videoRes = await fetch(signedUrl);

  if (!videoRes.ok || !videoRes.body) {
    throw new Error(`Failed to fetch video from storage: ${videoRes.status}`);
  }

  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const fileSizeBytes = videoBuffer.byteLength;

  const hasThumbnail = !!(thumbnailBucket && thumbnailPath);

  // 2) Initialize video upload with actual file size
  const initRes = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: personUrn,
        fileSizeBytes,
        uploadCaptions: false,
        uploadThumbnail: hasThumbnail,
      },
    }),
  });

  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`LinkedIn video init failed: ${initRes.status} ${text}`);
  }

  const initData = await initRes.json();
  const uploadInstructions = initData.value?.uploadInstructions;
  const videoUrn = initData.value?.video;
  const uploadToken = initData.value?.uploadToken ?? "";

  if (!uploadInstructions?.length || !videoUrn) {
    throw new Error(`LinkedIn video init missing uploadInstructions or video URN. Response: ${JSON.stringify(initData)}`);
  }

  // 3) Upload each part and collect ETags
  const uploadedPartIds: string[] = [];

  for (const instruction of uploadInstructions) {
    const { uploadUrl, firstByte, lastByte } = instruction;
    const chunk = videoBuffer.slice(firstByte, lastByte + 1);

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: chunk,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => "");
      throw new Error(`LinkedIn video part upload failed: ${uploadRes.status} ${text}`);
    }

    // Collect ETag from response header
    const etag = uploadRes.headers.get("etag");
    if (etag) {
      // Strip quotes if present
      uploadedPartIds.push(etag.replace(/"/g, ""));
    }
  }

  // 4) Finalize the upload
  const finalizeRes = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify({
      finalizeUploadRequest: {
        video: videoUrn,
        uploadToken,
        uploadedPartIds,
      },
    }),
  });

  if (!finalizeRes.ok) {
    const text = await finalizeRes.text();
    throw new Error(`LinkedIn video finalize failed: ${finalizeRes.status} ${text}`);
  }

  // 5) Upload thumbnail if provided
  if (hasThumbnail) {
    const thumbnailUploadUrl = initData.value?.thumbnailUploadUrl;
    if (thumbnailUploadUrl) {
      try {
        const thumbSignedUrl = await getSignedDownloadUrl({ bucket: thumbnailBucket!, path: thumbnailPath! });
        const thumbRes = await fetch(thumbSignedUrl);
        if (thumbRes.ok) {
          const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
          const thumbUploadRes = await fetch(thumbnailUploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
              "media-type-family": "STILLIMAGE",
            },
            body: thumbBuffer,
          });
          if (!thumbUploadRes.ok) {
            console.error("[LinkedIn] Thumbnail upload failed:", thumbUploadRes.status);
          }
        }
      } catch (e: any) {
        console.error("[LinkedIn] Thumbnail upload error (non-fatal):", e?.message);
      }
    }
  }

  // 6) Create a post with the video
  const postText = `${title}${description ? `\n\n${description}` : ""}`;

  const postRes = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify({
      author: personUrn,
      commentary: postText.slice(0, 3000),
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          title: title.slice(0, 200),
          id: videoUrn,
        },
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (!postRes.ok) {
    const text = await postRes.text();
    throw new Error(`LinkedIn post creation failed: ${postRes.status} ${text}`);
  }

  // LinkedIn returns the post URN in the x-restli-id header
  const linkedinPostId =
    postRes.headers.get("x-restli-id") ||
    postRes.headers.get("x-linkedin-id") ||
    videoUrn;

  return { linkedinPostId };
}
