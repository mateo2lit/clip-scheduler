import { supabaseAdmin } from "./supabaseAdmin";

type UploadToBlueskyArgs = {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
  bucket: string;
  storagePath: string;
  caption: string;
};

const BSKY_SERVICE = "https://bsky.social";

async function refreshSession(refreshJwt: string): Promise<{
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}> {
  const res = await fetch(`${BSKY_SERVICE}/xrpc/com.atproto.server.refreshSession`, {
    method: "POST",
    headers: { Authorization: `Bearer ${refreshJwt}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bluesky token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Bluesky token refresh error: ${data.message || data.error}`);

  return { did: data.did, handle: data.handle, accessJwt: data.accessJwt, refreshJwt: data.refreshJwt };
}

async function getSession(handle: string, appPassword: string): Promise<{
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}> {
  const res = await fetch(`${BSKY_SERVICE}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bluesky login failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Bluesky login error: ${data.message || data.error}`);

  return { did: data.did, handle: data.handle, accessJwt: data.accessJwt, refreshJwt: data.refreshJwt };
}

export { getSession as blueskyLogin };

export async function uploadToBluesky(args: UploadToBlueskyArgs): Promise<{
  uri: string;
  cid: string;
  accessJwt: string;
  refreshJwt: string;
}> {
  const { did, accessJwt, refreshJwt, bucket, storagePath, caption } = args;
  let currentAccessJwt = accessJwt;
  let currentRefreshJwt = refreshJwt;

  // Download video from Supabase Storage
  const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
    .from(bucket)
    .download(storagePath);

  if (downloadErr || !fileData) {
    throw new Error(`Failed to download video from storage: ${downloadErr?.message || "unknown"}`);
  }

  const videoBuffer = Buffer.from(await fileData.arrayBuffer());

  const uploadBlob = async () =>
    fetch(`${BSKY_SERVICE}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentAccessJwt}`,
        "Content-Type": "video/mp4",
      },
      body: videoBuffer,
    });

  // Upload blob to Bluesky (retry once after refresh on ExpiredToken)
  let uploadRes = await uploadBlob();
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    const shouldRefresh = uploadRes.status === 401 || text.includes("ExpiredToken");
    if (!shouldRefresh) {
      throw new Error(`Bluesky blob upload failed: ${uploadRes.status} ${text}`);
    }

    const refreshed = await refreshSession(currentRefreshJwt);
    currentAccessJwt = refreshed.accessJwt;
    currentRefreshJwt = refreshed.refreshJwt;

    uploadRes = await uploadBlob();
    if (!uploadRes.ok) {
      const retryText = await uploadRes.text();
      throw new Error(`Bluesky blob upload failed: ${uploadRes.status} ${retryText}`);
    }
  }

  const uploadData = await uploadRes.json();
  if (uploadData.error) throw new Error(`Bluesky upload error: ${uploadData.message || uploadData.error}`);

  const blob = uploadData.blob;

  // Create post record with video embed
  const now = new Date().toISOString();
  const record: any = {
    $type: "app.bsky.feed.post",
    text: caption,
    createdAt: now,
    embed: {
      $type: "app.bsky.embed.video",
      video: blob,
    },
  };

  const createRecord = async () =>
    fetch(`${BSKY_SERVICE}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentAccessJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: did,
        collection: "app.bsky.feed.post",
        record,
      }),
    });

  let createRes = await createRecord();
  if (!createRes.ok) {
    const text = await createRes.text();
    const shouldRefresh = createRes.status === 401 || text.includes("ExpiredToken");
    if (!shouldRefresh) {
      throw new Error(`Bluesky post creation failed: ${createRes.status} ${text}`);
    }

    const refreshed = await refreshSession(currentRefreshJwt);
    currentAccessJwt = refreshed.accessJwt;
    currentRefreshJwt = refreshed.refreshJwt;

    createRes = await createRecord();
    if (!createRes.ok) {
      const retryText = await createRes.text();
      throw new Error(`Bluesky post creation failed: ${createRes.status} ${retryText}`);
    }
  }

  const createData = await createRes.json();
  if (createData.error) throw new Error(`Bluesky post error: ${createData.message || createData.error}`);

  return {
    uri: createData.uri,
    cid: createData.cid,
    accessJwt: currentAccessJwt,
    refreshJwt: currentRefreshJwt,
  };
}
