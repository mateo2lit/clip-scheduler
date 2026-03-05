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

function hasExpiredTokenSignal(status: number, text: string) {
  const body = String(text || "");
  return status === 401 || /ExpiredToken/i.test(body) || /token has expired/i.test(body);
}

type SessionState = {
  accessJwt: string;
  refreshJwt: string;
};

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
  const session: SessionState = { accessJwt, refreshJwt };

  // Always refresh first so scheduled posts don't depend on a short-lived access token.
  try {
    const refreshed = await refreshSession(session.refreshJwt);
    session.accessJwt = refreshed.accessJwt;
    session.refreshJwt = refreshed.refreshJwt;
  } catch {
    // If refresh fails we still try with the stored access token once below.
  }

  async function callWithRefresh(
    requestFactory: (jwt: string) => Promise<Response>,
    failurePrefix: string
  ): Promise<Response> {
    let refreshAttempts = 0;
    let res = await requestFactory(session.accessJwt);

    while (!res.ok) {
      const text = await res.text();
      if (!hasExpiredTokenSignal(res.status, text)) {
        throw new Error(`${failurePrefix}: ${res.status} ${text}`);
      }

      if (refreshAttempts >= 2) {
        throw new Error(`${failurePrefix}: ${res.status} ${text}`);
      }

      const refreshed = await refreshSession(session.refreshJwt);
      session.accessJwt = refreshed.accessJwt;
      session.refreshJwt = refreshed.refreshJwt;
      refreshAttempts += 1;

      res = await requestFactory(session.accessJwt);
    }

    return res;
  }

  // Download video from Supabase Storage
  const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
    .from(bucket)
    .download(storagePath);

  if (downloadErr || !fileData) {
    throw new Error(`Failed to download video from storage: ${downloadErr?.message || "unknown"}`);
  }

  const videoBuffer = Buffer.from(await fileData.arrayBuffer());

  const uploadBlob = (jwt: string) =>
    fetch(`${BSKY_SERVICE}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "video/mp4",
      },
      body: videoBuffer,
    });
  const uploadRes = await callWithRefresh(uploadBlob, "Bluesky blob upload failed");

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

  const createRecord = (jwt: string) =>
    fetch(`${BSKY_SERVICE}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: did,
        collection: "app.bsky.feed.post",
        record,
      }),
    });
  const createRes = await callWithRefresh(createRecord, "Bluesky post creation failed");

  const createData = await createRes.json();
  if (createData.error) throw new Error(`Bluesky post error: ${createData.message || createData.error}`);

  return {
    uri: createData.uri,
    cid: createData.cid,
    accessJwt: session.accessJwt,
    refreshJwt: session.refreshJwt,
  };
}
