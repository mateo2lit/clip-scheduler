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
  if (isRevokedTokenError(body)) return false; // revoked ≠ expired; don't retry
  return status === 401 || /ExpiredToken/i.test(body) || /token has expired/i.test(body);
}

function isRevokedTokenError(text: string) {
  return /token has been revoked/i.test(text) || /TokenRevoked/i.test(text);
}

type SessionState = {
  accessJwt: string;
  refreshJwt: string;
};

async function refreshSession(serviceUrl: string, refreshJwt: string): Promise<{
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}> {
  const res = await fetch(`${serviceUrl}/xrpc/com.atproto.server.refreshSession`, {
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

function parsePdsFromDidDoc(doc: any): string | null {
  const services = Array.isArray(doc?.service) ? doc.service : [];
  for (const svc of services) {
    const type = String(svc?.type || "");
    const id = String(svc?.id || "");
    const endpoint = String(svc?.serviceEndpoint || "").trim();
    if (!endpoint) continue;
    if (type === "AtprotoPersonalDataServer" || id.includes("atproto_pds")) {
      return endpoint.replace(/\/+$/, "");
    }
  }
  return null;
}

async function resolvePdsServiceUrl(did: string): Promise<string> {
  try {
    if (did.startsWith("did:plc:")) {
      const res = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
      if (res.ok) {
        const doc = await res.json();
        const parsed = parsePdsFromDidDoc(doc);
        if (parsed) return parsed;
      }
    }

    if (did.startsWith("did:web:")) {
      const webId = did.slice("did:web:".length).replace(/:/g, "/");
      const didJsonUrl = `https://${webId}/.well-known/did.json`;
      const res = await fetch(didJsonUrl);
      if (res.ok) {
        const doc = await res.json();
        const parsed = parsePdsFromDidDoc(doc);
        if (parsed) return parsed;
      }
    }
  } catch {
    // Fallback below.
  }

  return BSKY_SERVICE;
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

// ── Shared facet detection (used by both video and text posts) ────────────────

type BlueskyFacet = {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; [key: string]: unknown }>;
};

/**
 * Detect URLs and hashtags in text and return AT Protocol facets.
 * Byte offsets are computed from UTF-8 encoding (required by AT Protocol).
 */
export function detectBlueskyFacets(text: string): BlueskyFacet[] {
  const facets: BlueskyFacet[] = [];
  const encoder = new TextEncoder();

  // URLs
  const urlRegex = /https?:\/\/[^\s\])"'>]+/g;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const pre = encoder.encode(text.slice(0, match.index));
    const body = encoder.encode(match[0]);
    facets.push({
      index: { byteStart: pre.length, byteEnd: pre.length + body.length },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: match[0] }],
    });
  }

  // Hashtags
  const tagRegex = /#([a-zA-Z][a-zA-Z0-9_]*)/g;
  while ((match = tagRegex.exec(text)) !== null) {
    const pre = encoder.encode(text.slice(0, match.index));
    const body = encoder.encode(match[0]);
    facets.push({
      index: { byteStart: pre.length, byteEnd: pre.length + body.length },
      features: [{ $type: "app.bsky.richtext.facet#tag", tag: match[1] }],
    });
  }

  return facets;
}

export { countBlueskyGraphemes } from "./blueskyUtils";

export async function uploadToBluesky(args: UploadToBlueskyArgs): Promise<{
  uri: string;
  cid: string;
  accessJwt: string;
  refreshJwt: string;
}> {
  const { did, accessJwt, refreshJwt, bucket, storagePath, caption } = args;
  const session: SessionState = { accessJwt, refreshJwt };
  const serviceUrl = await resolvePdsServiceUrl(did);

  // Always refresh first so scheduled posts don't depend on a short-lived access token.
  try {
    const refreshed = await refreshSession(serviceUrl, session.refreshJwt);
    session.accessJwt = refreshed.accessJwt;
    session.refreshJwt = refreshed.refreshJwt;
  } catch (e: any) {
    if (isRevokedTokenError(e.message || "")) {
      throw new Error("Bluesky session has been revoked — please reconnect your Bluesky account.");
    }
    // Other refresh failures: try with the stored access token once below.
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

      let refreshed;
      try {
        refreshed = await refreshSession(serviceUrl, session.refreshJwt);
      } catch (e: any) {
        if (isRevokedTokenError(e.message || "")) {
          throw new Error("Bluesky session has been revoked — please reconnect your Bluesky account.");
        }
        throw e;
      }
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
    fetch(`${serviceUrl}/xrpc/com.atproto.repo.uploadBlob`, {
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

  // Force video/mp4 — Bluesky rejects video/quicktime even though the file plays fine.
  const blob = { ...uploadData.blob, mimeType: "video/mp4" };

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
    fetch(`${serviceUrl}/xrpc/com.atproto.repo.createRecord`, {
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

// ── Text-only post ────────────────────────────────────────────────────────────

type PostTextToBlueskyArgs = {
  did: string;
  accessJwt: string;
  refreshJwt: string;
  text: string; // max 300 grapheme clusters
  linkCard?: {
    uri: string;
    title: string;
    description: string;
    thumbUrl?: string; // optional OG image URL to upload as thumb blob
  };
};

/**
 * Publish a text-only (or text + external link card) post to Bluesky.
 * Automatically detects URL/hashtag facets in the text.
 * No video upload required.
 */
export async function postTextToBluesky(args: PostTextToBlueskyArgs): Promise<{
  uri: string;
  cid: string;
  accessJwt: string;
  refreshJwt: string;
}> {
  const { did, linkCard } = args;
  const session: SessionState = { accessJwt: args.accessJwt, refreshJwt: args.refreshJwt };
  const serviceUrl = await resolvePdsServiceUrl(did);

  // Always refresh first
  try {
    const refreshed = await refreshSession(serviceUrl, session.refreshJwt);
    session.accessJwt = refreshed.accessJwt;
    session.refreshJwt = refreshed.refreshJwt;
  } catch (e: any) {
    if (isRevokedTokenError(e.message || "")) {
      throw new Error("Bluesky session has been revoked — please reconnect your Bluesky account.");
    }
  }

  function callWithRefresh(
    requestFactory: (jwt: string) => Promise<Response>,
    failurePrefix: string
  ): Promise<Response> {
    let refreshAttempts = 0;

    async function attempt(): Promise<Response> {
      let res = await requestFactory(session.accessJwt);

      while (!res.ok) {
        const text = await res.text();
        if (!hasExpiredTokenSignal(res.status, text)) {
          throw new Error(`${failurePrefix}: ${res.status} ${text}`);
        }
        if (refreshAttempts >= 2) {
          throw new Error(`${failurePrefix}: ${res.status} ${text}`);
        }
        let refreshed;
        try {
          refreshed = await refreshSession(serviceUrl, session.refreshJwt);
        } catch (e: any) {
          if (isRevokedTokenError(e.message || "")) {
            throw new Error("Bluesky session has been revoked — please reconnect your Bluesky account.");
          }
          throw e;
        }
        session.accessJwt = refreshed.accessJwt;
        session.refreshJwt = refreshed.refreshJwt;
        refreshAttempts += 1;
        res = await requestFactory(session.accessJwt);
      }
      return res;
    }

    return attempt();
  }

  // Optionally upload link card thumbnail blob
  let thumbBlob: any = undefined;
  if (linkCard?.thumbUrl) {
    try {
      const thumbFetch = await fetch(linkCard.thumbUrl, { signal: AbortSignal.timeout(5000) });
      if (thumbFetch.ok) {
        const thumbBuffer = Buffer.from(await thumbFetch.arrayBuffer());
        const contentType = thumbFetch.headers.get("content-type") || "image/jpeg";
        const uploadThumb = (jwt: string) =>
          fetch(`${serviceUrl}/xrpc/com.atproto.repo.uploadBlob`, {
            method: "POST",
            headers: { Authorization: `Bearer ${jwt}`, "Content-Type": contentType },
            body: thumbBuffer,
          });
        const thumbRes = await callWithRefresh(uploadThumb, "Bluesky thumb upload failed");
        const thumbData = await thumbRes.json();
        if (!thumbData.error) thumbBlob = thumbData.blob;
      }
    } catch {
      // Thumbnail is non-fatal — post without it
    }
  }

  const now = new Date().toISOString();
  const text = args.text;
  const facets = detectBlueskyFacets(text);

  const record: any = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: now,
    ...(facets.length > 0 ? { facets } : {}),
  };

  if (linkCard) {
    record.embed = {
      $type: "app.bsky.embed.external",
      external: {
        uri: linkCard.uri,
        title: linkCard.title || "",
        description: linkCard.description || "",
        ...(thumbBlob ? { thumb: thumbBlob } : {}),
      },
    };
  }

  const createRecord = (jwt: string) =>
    fetch(`${serviceUrl}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ repo: did, collection: "app.bsky.feed.post", record }),
    });

  const createRes = await callWithRefresh(createRecord, "Bluesky text post creation failed");
  const createData = await createRes.json();
  if (createData.error) throw new Error(`Bluesky text post error: ${createData.message || createData.error}`);

  return {
    uri: createData.uri,
    cid: createData.cid,
    accessJwt: session.accessJwt,
    refreshJwt: session.refreshJwt,
  };
}
