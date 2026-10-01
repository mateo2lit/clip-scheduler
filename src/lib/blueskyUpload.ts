import { supabaseAdmin } from "./supabaseAdmin";
import { detectVideoContainer, remuxToMp4 } from "./videoRemux";
import { blueskyThreadgateAllow, type BlueskyReplyGate } from "./postOptions";

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

export async function refreshBlueskySession(serviceUrl: string, refreshJwt: string): Promise<{
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}> {
  return refreshSession(serviceUrl, refreshJwt);
}

export { resolvePdsServiceUrl as resolveBlueskyPdsServiceUrl };

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

/** Refreshes the session up front and returns a caller that retries once more on an expired token. */
async function openSession(serviceUrl: string, accessJwt: string, refreshJwt: string) {
  const session: SessionState = { accessJwt, refreshJwt };

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

  return { session, callWithRefresh };
}

// ── Small video posts (direct to the PDS) ─────────────────────────────────────

/**
 * A PDS's own uploadBlob takes blobs up to 50 MB. Videos at or under this size keep
 * the direct, single-run path; larger ones go through the video service below, which
 * also needs a verified email and has a daily cap, so it isn't used when not needed.
 */
export const BLUESKY_DIRECT_UPLOAD_MAX_BYTES = 50 * 1000 * 1000;

type UploadToBlueskyArgs = {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
  bucket: string;
  storagePath: string;
  caption: string;
  /** Optional post language, video alt text and reply control, from postOptions.ts. */
  langs?: string[];
  alt?: string;
  replyGate?: BlueskyReplyGate;
};

export async function uploadToBluesky(args: UploadToBlueskyArgs): Promise<{
  uri: string;
  cid: string;
  accessJwt: string;
  refreshJwt: string;
}> {
  const { did, bucket, storagePath, caption, langs, alt, replyGate } = args;
  const serviceUrl = await resolvePdsServiceUrl(did);
  const opened = await openSession(serviceUrl, args.accessJwt, args.refreshJwt);
  const { callWithRefresh } = opened;

  // Download video from Supabase Storage
  const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
    .from(bucket)
    .download(storagePath);

  if (downloadErr || !fileData) {
    throw new Error(`Failed to download video from storage: ${downloadErr?.message || "unknown"}`);
  }

  let videoBuffer: Buffer = Buffer.from(await fileData.arrayBuffer());

  // Bluesky's lexicon validator requires embed.video.mimeType === "video/mp4",
  // and its blob server detects the actual container from file bytes (not the
  // Content-Type header). QuickTime-wrapped clips (common from Twitch / some
  // yt-dlp outputs) get stored as video/quicktime and the post-record fails
  // schema validation. Remux to a true MP4 container before upload.
  const container = detectVideoContainer(videoBuffer);
  if (container === "quicktime" || container === "unknown") {
    try {
      videoBuffer = await remuxToMp4(videoBuffer);
    } catch (e: any) {
      throw new Error(
        `Bluesky upload preparation failed: could not remux ${container} container to mp4 — ${e?.message || e}`
      );
    }
  }

  // A Uint8Array view over the same memory (no copy).
  // Node Buffers sit on a regular ArrayBuffer (never shared memory), so the cast is safe.
  const videoBytes = new Uint8Array(videoBuffer.buffer as ArrayBuffer, videoBuffer.byteOffset, videoBuffer.byteLength);
  const uploadBlob = (jwt: string) =>
    fetch(`${serviceUrl}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "video/mp4",
      },
      body: videoBytes,
    });
  const uploadRes = await callWithRefresh(uploadBlob, "Bluesky blob upload failed");

  const uploadData = await uploadRes.json();
  if (uploadData.error) throw new Error(`Bluesky upload error: ${uploadData.message || uploadData.error}`);

  // After remux the blob server should store as video/mp4. Use whatever the
  // server actually returned — atproto strictly enforces that the embed
  // reference matches the stored blob's mimeType.
  return createVideoPostRecord(serviceUrl, opened, { did, blob: uploadData.blob, caption, langs, alt, replyGate });
}

// ── Large video posts (two phases, via Bluesky's video service) ───────────────
//
// A PDS's own uploadBlob caps blobs at 50 MB, so videos go through video.bsky.app,
// which takes up to 300 MB / 10 minutes, transcodes, and then writes the blob to
// the user's PDS itself. Processing can take minutes, so the worker starts the
// job on one run and publishes from a later run, like Instagram containers.

const BSKY_VIDEO_SERVICE = "https://video.bsky.app";

type BlueskyJobStatus = {
  jobId?: string;
  state?: string;
  blob?: unknown;
  error?: string;
  message?: string;
};

/** uploadVideo answers with a bare JobStatus; getJobStatus wraps it in { jobStatus }. */
function readJobStatus(body: any): BlueskyJobStatus {
  return (body?.jobStatus ?? body ?? {}) as BlueskyJobStatus;
}

type StartBlueskyVideoArgs = {
  did: string;
  accessJwt: string;
  refreshJwt: string;
  bucket: string;
  storagePath: string;
};

/** Phase 1: upload the video to Bluesky's video service and return its processing job ID. */
export async function startBlueskyVideoJob(args: StartBlueskyVideoArgs): Promise<{
  jobId: string;
  accessJwt: string;
  refreshJwt: string;
}> {
  const { did, bucket, storagePath } = args;
  const serviceUrl = await resolvePdsServiceUrl(did);
  const { session, callWithRefresh } = await openSession(serviceUrl, args.accessJwt, args.refreshJwt);

  // The video service writes the finished blob to the user's PDS, so it needs a
  // token addressed to that PDS for uploadBlob. 30 minutes covers a slow upload.
  const pdsDid = `did:web:${new URL(serviceUrl).hostname}`;
  const exp = Math.floor(Date.now() / 1000) + 30 * 60;
  const authRes = await callWithRefresh(
    (jwt) =>
      fetch(
        `${serviceUrl}/xrpc/com.atproto.server.getServiceAuth?aud=${encodeURIComponent(pdsDid)}` +
          `&lxm=com.atproto.repo.uploadBlob&exp=${exp}`,
        { headers: { Authorization: `Bearer ${jwt}` } }
      ),
    "Bluesky video authorization failed"
  );
  const { token: serviceToken } = await authRes.json();
  if (!serviceToken) throw new Error("Bluesky video authorization failed: no service token returned");

  // Download video from Supabase Storage
  const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
    .from(bucket)
    .download(storagePath);

  if (downloadErr || !fileData) {
    throw new Error(`Failed to download video from storage: ${downloadErr?.message || "unknown"}`);
  }

  const videoBuffer: Buffer = Buffer.from(await fileData.arrayBuffer());

  // The video service transcodes everything to MP4, so QuickTime clips need no remux;
  // just label them honestly.
  const container = detectVideoContainer(videoBuffer);
  const contentType = container === "quicktime" ? "video/quicktime" : "video/mp4";
  const name = storagePath.split("/").pop() || "video.mp4";

  // A Uint8Array view over the same memory (no copy): videos can be up to 300 MB,
  // so an extra copy would double the worker's memory use.
  // Node Buffers sit on a regular ArrayBuffer (never shared memory), so the cast is safe.
  const videoBytes = new Uint8Array(videoBuffer.buffer as ArrayBuffer, videoBuffer.byteOffset, videoBuffer.byteLength);
  const uploadRes = await fetch(
    `${BSKY_VIDEO_SERVICE}/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(did)}&name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceToken}`, "Content-Type": contentType },
      body: videoBytes,
    }
  );

  const text = await uploadRes.text();
  let job: BlueskyJobStatus = {};
  try {
    job = readJobStatus(JSON.parse(text));
  } catch {
    // Not JSON; handled below.
  }

  // 409 means this exact video was already processed; its job ID still resolves to the blob.
  if ((uploadRes.ok || uploadRes.status === 409) && job.jobId) {
    return { jobId: job.jobId, accessJwt: session.accessJwt, refreshJwt: session.refreshJwt };
  }

  throw new Error(`Bluesky video upload failed: ${uploadRes.status} ${job.message || job.error || text}`);
}

/** Phase 2a: check a video job. "done" carries the blob to embed in the post. */
export async function checkBlueskyVideoJob(jobId: string): Promise<
  { status: "processing" } | { status: "done"; blob: unknown } | { status: "failed"; error: string }
> {
  const res = await fetch(
    `${BSKY_VIDEO_SERVICE}/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`
  );
  const text = await res.text();
  let job: BlueskyJobStatus = {};
  try {
    job = readJobStatus(JSON.parse(text));
  } catch {
    // Not JSON; handled below.
  }

  // A 5xx is the service having a bad moment; the next worker run checks again.
  if (res.status >= 500) return { status: "processing" };
  if (!res.ok) return { status: "failed", error: `Bluesky video check failed: ${res.status} ${job.message || job.error || text}` };

  if (job.state === "JOB_STATE_FAILED") {
    return { status: "failed", error: `Bluesky couldn't process the video: ${job.message || job.error || "unknown reason"}` };
  }
  if (job.blob) return { status: "done", blob: job.blob };
  return { status: "processing" };
}

type PublishBlueskyVideoArgs = {
  did: string;
  accessJwt: string;
  refreshJwt: string;
  blob: unknown;
  caption: string;
  /** Optional post language, video alt text and reply control, from postOptions.ts. */
  langs?: string[];
  alt?: string;
  replyGate?: BlueskyReplyGate;
};

/** Phase 2b: create the post that embeds a processed video blob. */
export async function publishBlueskyVideoPost(args: PublishBlueskyVideoArgs): Promise<{
  uri: string;
  cid: string;
  accessJwt: string;
  refreshJwt: string;
}> {
  const serviceUrl = await resolvePdsServiceUrl(args.did);
  const opened = await openSession(serviceUrl, args.accessJwt, args.refreshJwt);
  return createVideoPostRecord(serviceUrl, opened, args);
}

/** Creates the video post (and its reply-control record) using an already-open session. */
async function createVideoPostRecord(
  serviceUrl: string,
  { session, callWithRefresh }: Awaited<ReturnType<typeof openSession>>,
  { did, blob, caption, langs, alt, replyGate }: Omit<PublishBlueskyVideoArgs, "accessJwt" | "refreshJwt">
): Promise<{ uri: string; cid: string; accessJwt: string; refreshJwt: string }> {
  // Create post record with video embed
  const now = new Date().toISOString();
  const record: any = {
    $type: "app.bsky.feed.post",
    text: caption,
    createdAt: now,
    embed: {
      $type: "app.bsky.embed.video",
      video: blob,
      ...(alt ? { alt } : {}),
    },
    ...(langs && langs.length > 0 ? { langs } : {}),
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

  // Reply control is a separate threadgate record whose rkey matches the post's.
  // The post is already live, so a failure here is logged rather than thrown.
  if (replyGate) {
    try {
      const rkey = String(createData.uri).split("/").pop();
      const createGate = (jwt: string) =>
        fetch(`${serviceUrl}/xrpc/com.atproto.repo.createRecord`, {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: did,
            collection: "app.bsky.feed.threadgate",
            rkey,
            record: {
              $type: "app.bsky.feed.threadgate",
              post: createData.uri,
              allow: blueskyThreadgateAllow(replyGate),
              createdAt: now,
            },
          }),
        });
      await callWithRefresh(createGate, "Bluesky reply settings failed");
    } catch (e: any) {
      console.error("[Bluesky] Posted, but setting who can reply failed:", e?.message);
    }
  }

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
