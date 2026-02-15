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
 * 1. Initialize upload — register the video with LinkedIn
 * 2. Upload binary — PUT the video bytes to LinkedIn's upload URL
 * 3. Create post — publish the video with text
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
  } = args;

  assertOk(accessToken, "Missing accessToken");
  assertOk(personUrn, "Missing personUrn");
  assertOk(bucket, "Missing bucket");
  assertOk(storagePath, "Missing storagePath");
  assertOk(title, "Missing title");

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": "202402",
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

  // 2) Initialize video upload with actual file size
  const initRes = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers,
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: personUrn,
        fileSizeBytes,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
  });

  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`LinkedIn video init failed: ${initRes.status} ${text}`);
  }

  const initData = await initRes.json();
  const uploadUrl = initData.value?.uploadInstructions?.[0]?.uploadUrl;
  const videoUrn = initData.value?.video;

  if (!uploadUrl || !videoUrn) {
    throw new Error(`LinkedIn video init did not return uploadUrl or video URN. Response: ${JSON.stringify(initData)}`);
  }

  // 3) Upload binary to LinkedIn
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`LinkedIn video upload failed: ${uploadRes.status} ${text}`);
  }

  // 4) Create a post with the video
  const postText = `${title}${description ? `\n\n${description}` : ""}`;

  const postRes = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers,
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
