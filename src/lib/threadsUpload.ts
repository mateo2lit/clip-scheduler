import { supabaseAdmin } from "./supabaseAdmin";

type CreateThreadsContainerArgs = {
  threadsUserId: string;
  accessToken: string;
  bucket: string;
  storagePath: string;
  caption: string;
};

type CheckAndPublishArgs = {
  containerId: string;
  threadsUserId: string;
  accessToken: string;
};

async function getSignedDownloadUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60); // 1 hour

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message || "unknown"}`);
  }
  return data.signedUrl;
}

/**
 * Phase 1: Create a Threads media container for a video.
 * Returns the container ID. Store it in ig_container_id (reused field).
 */
export async function createThreadsContainer(args: CreateThreadsContainerArgs): Promise<{
  containerId: string;
}> {
  const { threadsUserId, accessToken, bucket, storagePath, caption } = args;

  const videoUrl = await getSignedDownloadUrl(bucket, storagePath);

  const params = new URLSearchParams({
    media_type: "VIDEO",
    video_url: videoUrl,
    text: caption,
    access_token: accessToken,
  });

  const res = await fetch(
    `https://graph.threads.net/${threadsUserId}/threads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Threads container creation failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Threads container error: ${data.error.message || data.error}`);

  return { containerId: String(data.id) };
}

/**
 * Phase 2: Check container status and publish when ready.
 */
export async function checkAndPublishThreadsContainer(args: CheckAndPublishArgs): Promise<{
  status: "processing" | "posted" | "error";
  threadsMediaId?: string;
  error?: string;
}> {
  const { containerId, threadsUserId, accessToken } = args;

  // Check container status
  const statusRes = await fetch(
    `https://graph.threads.net/${containerId}?fields=status&access_token=${encodeURIComponent(accessToken)}`
  );

  if (!statusRes.ok) {
    const text = await statusRes.text();
    throw new Error(`Threads status check failed: ${statusRes.status} ${text}`);
  }

  const statusData = await statusRes.json();

  if (statusData.error) {
    return { status: "error", error: statusData.error.message || "Status check error" };
  }

  const containerStatus = statusData.status?.toUpperCase() || "";

  if (containerStatus === "ERROR") {
    return { status: "error", error: "Threads container processing failed" };
  }

  if (containerStatus !== "FINISHED") {
    return { status: "processing" };
  }

  // Publish the container
  const publishRes = await fetch(
    `https://graph.threads.net/${threadsUserId}/threads_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      }),
    }
  );

  if (!publishRes.ok) {
    const text = await publishRes.text();
    throw new Error(`Threads publish failed: ${publishRes.status} ${text}`);
  }

  const publishData = await publishRes.json();
  if (publishData.error) {
    return { status: "error", error: publishData.error.message || "Publish failed" };
  }

  return { status: "posted", threadsMediaId: String(publishData.id) };
}

// ── Text-only post ────────────────────────────────────────────────────────────

type CreateThreadsTextContainerArgs = {
  threadsUserId: string;
  accessToken: string;
  text: string; // max 500 chars
  linkAttachmentUrl?: string;
};

/**
 * Phase 1 for a text-only Threads post: create the container.
 * TEXT containers are ready immediately (no processing delay),
 * so the worker can call checkAndPublishThreadsContainer right after.
 */
export async function createThreadsTextContainer(
  args: CreateThreadsTextContainerArgs
): Promise<{ containerId: string }> {
  const { threadsUserId, accessToken, text, linkAttachmentUrl } = args;

  const params = new URLSearchParams({
    media_type: "TEXT",
    text: text.slice(0, 500),
    access_token: accessToken,
  });

  if (linkAttachmentUrl) {
    params.set("link_attachment_url", linkAttachmentUrl);
  }

  const res = await fetch(`https://graph.threads.net/${threadsUserId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Threads text container creation failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Threads text container error: ${data.error.message || data.error}`);

  return { containerId: String(data.id) };
}
