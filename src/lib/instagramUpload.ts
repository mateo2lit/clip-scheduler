import { supabaseAdmin } from "./supabaseAdmin";

type UploadToInstagramArgs = {
  userId: string;
  platformAccountId: string;
  igUserId: string;
  accessToken: string;

  bucket: string;
  storagePath: string;

  caption: string;
};

type CreateContainerArgs = {
  igUserId: string;
  accessToken: string;
  bucket: string;
  storagePath: string;
  caption: string;
};

type CheckAndPublishArgs = {
  containerId: string;
  igUserId: string;
  accessToken: string;
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

/**
 * Step 1: Create an Instagram Reels container. Returns the container ID.
 * Completes in 2-3 seconds — safe for Vercel Hobby 10s timeout.
 */
export async function createInstagramContainer(args: CreateContainerArgs): Promise<{
  containerId: string;
}> {
  const { igUserId, accessToken, bucket, storagePath, caption } = args;

  assertOk(igUserId, "Missing igUserId");
  assertOk(accessToken, "Missing accessToken");
  assertOk(bucket, "Missing bucket");
  assertOk(storagePath, "Missing storagePath");

  const signedUrl = await getSignedDownloadUrl({ bucket, path: storagePath });

  const containerParams = new URLSearchParams({
    access_token: accessToken,
    media_type: "REELS",
    video_url: signedUrl,
    caption: (caption || "").slice(0, 2200),
  });

  const containerRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media`,
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

  return { containerId };
}

/**
 * Step 2: Check container status and publish if ready.
 * Completes in 2-3 seconds — safe for Vercel Hobby 10s timeout.
 */
export async function checkAndPublishInstagramContainer(args: CheckAndPublishArgs): Promise<{
  status: "processing" | "posted" | "error";
  instagramMediaId?: string;
  error?: string;
}> {
  const { containerId, igUserId, accessToken } = args;

  // Check container status
  const statusRes = await fetch(
    `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
  );

  if (!statusRes.ok) {
    const text = await statusRes.text();
    return { status: "error", error: `Status check failed: ${statusRes.status} ${text}` };
  }

  const statusData = await statusRes.json();
  const statusCode = statusData.status_code;

  if (statusCode === "ERROR") {
    return { status: "error", error: `Instagram media processing failed: ${statusData.status || "Unknown error"}` };
  }

  if (statusCode !== "FINISHED") {
    // Still IN_PROGRESS — leave for next cron tick
    return { status: "processing" };
  }

  // FINISHED — publish the container
  const publishParams = new URLSearchParams({
    access_token: accessToken,
    creation_id: containerId,
  });

  const publishRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishParams,
    }
  );

  if (!publishRes.ok) {
    const text = await publishRes.text();
    return { status: "error", error: `Instagram publish failed: ${publishRes.status} ${text}` };
  }

  const publishData = await publishRes.json();

  if (publishData.error) {
    return { status: "error", error: `Instagram publish error: ${publishData.error.message}` };
  }

  const instagramMediaId = publishData.id;
  if (!instagramMediaId) {
    return { status: "error", error: "Instagram publish succeeded but no media ID returned" };
  }

  return { status: "posted", instagramMediaId };
}

/**
 * Legacy: Full upload flow (create → poll → publish) in a single call.
 * NOT used by the worker anymore — kept for backwards compatibility.
 */
export async function uploadSupabaseVideoToInstagram(args: UploadToInstagramArgs): Promise<{
  instagramMediaId: string;
}> {
  const {
    igUserId,
    accessToken,
    bucket,
    storagePath,
    caption,
  } = args;

  const { containerId } = await createInstagramContainer({
    igUserId,
    accessToken,
    bucket,
    storagePath,
    caption,
  });

  // Poll container status until FINISHED
  const maxPolls = 60; // Up to 5 minutes (60 * 5s)
  const pollInterval = 5000;

  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollInterval);

    const result = await checkAndPublishInstagramContainer({
      containerId,
      igUserId,
      accessToken,
    });

    if (result.status === "posted") {
      return { instagramMediaId: result.instagramMediaId! };
    }

    if (result.status === "error") {
      throw new Error(result.error);
    }

    // processing — keep polling
  }

  throw new Error("Instagram media processing timed out after 5 minutes");
}
