import { supabaseAdmin } from "./supabaseAdmin";

type UploadToInstagramArgs = {
  userId: string;
  platformAccountId: string;
  igUserId: string;
  pageAccessToken: string;

  bucket: string;
  storagePath: string;

  caption: string;
};

function assertOk(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSignedDownloadUrl(params: {
  bucket: string;
  path: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { bucket, path, expiresInSeconds = 60 * 60 } = params; // 1 hour for IG processing

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message || "unknown error"}`);
  }

  return data.signedUrl;
}

export async function uploadSupabaseVideoToInstagram(args: UploadToInstagramArgs): Promise<{
  instagramMediaId: string;
}> {
  const {
    userId,
    platformAccountId,
    igUserId,
    pageAccessToken,
    bucket,
    storagePath,
    caption,
  } = args;

  assertOk(igUserId, "Missing igUserId");
  assertOk(pageAccessToken, "Missing pageAccessToken");
  assertOk(bucket, "Missing bucket");
  assertOk(storagePath, "Missing storagePath");

  // 1) Create signed URL with long expiry (IG needs time to process)
  const signedUrl = await getSignedDownloadUrl({ bucket, path: storagePath });

  // 2) Create media container
  const containerParams = new URLSearchParams({
    access_token: pageAccessToken,
    media_type: "REELS",
    video_url: signedUrl,
    caption: (caption || "").slice(0, 2200),
  });

  const containerRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: containerParams,
    }
  );

  if (!containerRes.ok) {
    const text = await containerRes.text();
    throw new Error(`Instagram container creation failed: ${containerRes.status} ${text}`);
  }

  const containerData = await containerRes.json();

  if (containerData.error) {
    throw new Error(`Instagram container error: ${containerData.error.message}`);
  }

  const containerId = containerData.id;
  if (!containerId) {
    throw new Error("Instagram container creation succeeded but no container ID returned");
  }

  // 3) Poll container status until FINISHED
  const maxPolls = 60; // Up to 5 minutes (60 * 5s)
  const pollInterval = 5000;

  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollInterval);

    const statusRes = await fetch(
      `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${encodeURIComponent(pageAccessToken)}`
    );

    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    const status = statusData.status_code;

    if (status === "FINISHED") {
      break;
    }

    if (status === "ERROR") {
      throw new Error(
        `Instagram media processing failed: ${statusData.status || "Unknown error"}`
      );
    }

    // IN_PROGRESS - keep polling
  }

  // 4) Publish the container
  const publishParams = new URLSearchParams({
    access_token: pageAccessToken,
    creation_id: containerId,
  });

  const publishRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishParams,
    }
  );

  if (!publishRes.ok) {
    const text = await publishRes.text();
    throw new Error(`Instagram publish failed: ${publishRes.status} ${text}`);
  }

  const publishData = await publishRes.json();

  if (publishData.error) {
    throw new Error(`Instagram publish error: ${publishData.error.message}`);
  }

  const instagramMediaId = publishData.id;
  if (!instagramMediaId) {
    throw new Error("Instagram publish succeeded but no media ID returned");
  }

  return { instagramMediaId };
}
