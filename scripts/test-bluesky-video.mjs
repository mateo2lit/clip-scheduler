// Run: node --test scripts/test-bluesky-video.mjs
// Bluesky videos go through video.bsky.app (a PDS's own uploadBlob caps at 50 MB), in two worker
// phases, and the worker fails posts left in "posting" by a killed run. Loads the real code with
// mocked database and network; any unmocked import or network call fails the test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal chainable Supabase stand-in: records every query and answers from `responses[table]`. */
function fakeDb(responses, storageBytes = Buffer.from("fake-mp4-bytes")) {
  const queries = [];
  return {
    queries,
    storage: {
      from: () => ({
        download: async () => ({ data: { arrayBuffer: async () => storageBytes }, error: null }),
        createSignedUrl: async (p) => ({ data: { signedUrl: `https://storage.example.invalid/${p}` }, error: null }),
        remove: async () => ({ data: null, error: null }),
      }),
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "user@example.invalid" } } }) } },
    from(table) {
      const q = { table, ops: [], args: [], payload: null };
      queries.push(q);
      const chain = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") {
            return (resolve, reject) => Promise.resolve(responses[table]?.(q) ?? { data: null, error: null }).then(resolve, reject);
          }
          return (...args) => {
            q.ops.push(prop);
            q.args.push([prop, ...args]);
            if (prop === "upsert" || prop === "update" || prop === "insert") q.payload = args[0];
            return chain;
          };
        },
      });
      return chain;
    },
  };
}

function load(relative, mocks, { network = [], env = {} } = {}) {
  const pendingNetwork = [...network];
  const requests = [];
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const exports = {};
  const context = vm.createContext({
    exports, URL, URLSearchParams, Request, Response, Headers, Promise, Buffer, Uint8Array, Date, JSON, Math,
    process: { env },
    console: { error() {}, warn() {}, log() {} },
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unmocked import blocked: ${specifier}`);
    },
    async fetch(url, options) {
      requests.push({ url: new URL(String(url)), options });
      const next = pendingNetwork.shift();
      if (!next) throw new Error(`Unmocked network call blocked: ${url}`);
      next.inspect?.(new URL(String(url)), options);
      if (next.raw !== undefined) return new Response(next.raw, { status: next.status ?? 200, headers: next.headers });
      return Response.json(next.body ?? {}, { status: next.status ?? 200 });
    },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return { exports, requests, pendingNetwork };
}

const PDS = "https://morel.us-east.host.bsky.network";
const didDoc = { service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: PDS }] };
const plc = { inspect: (u) => assert.equal(u.host, "plc.directory"), body: didDoc };
const refresh = { inspect: (u) => assert.equal(u.pathname, "/xrpc/com.atproto.server.refreshSession"), body: { did: "did:plc:me", handle: "me.bsky.social", accessJwt: "access-2", refreshJwt: "refresh-2" } };
const serviceAuth = {
  inspect: (u, o) => {
    assert.equal(u.origin + u.pathname, `${PDS}/xrpc/com.atproto.server.getServiceAuth`);
    assert.equal(u.searchParams.get("aud"), "did:web:morel.us-east.host.bsky.network", "token is addressed to the user's PDS");
    assert.equal(u.searchParams.get("lxm"), "com.atproto.repo.uploadBlob");
    assert.equal(o.headers.Authorization, "Bearer access-2");
  },
  body: { token: "service-token" },
};

const storageRead = {
  inspect: (u) => assert.equal(u.host, "storage.example.invalid", "video is read from a signed URL, not downloaded into memory"),
  raw: "fake-mp4-bytes", headers: { "content-length": "14" },
};

function loadBlueskyLib(network, db = fakeDb({})) {
  return load("src/lib/blueskyUpload.ts", {
    "./supabaseAdmin": { supabaseAdmin: db },
    "./videoRemux": { detectVideoContainer: () => "mp4", remuxToMp4: async (b) => b },
    "./postOptions": { blueskyThreadgateAllow: () => [] },
    "./blueskyUtils": { countBlueskyGraphemes: () => 0 },
  }, { network });
}

const startArgs = { did: "did:plc:me", accessJwt: "access-1", refreshJwt: "refresh-1", bucket: "clips", storagePath: "u/clip.mp4" };

// ── Phase 1: upload to the video service ─────────────────────────────────────

test("Bluesky: videos upload to video.bsky.app with a PDS service token, not to the PDS", async () => {
  const lib = loadBlueskyLib([plc, refresh, serviceAuth, storageRead, {
    inspect: (u, o) => {
      assert.equal(u.origin + u.pathname, "https://video.bsky.app/xrpc/app.bsky.video.uploadVideo");
      assert.equal(u.searchParams.get("did"), "did:plc:me");
      assert.equal(u.searchParams.get("name"), "clip.mp4");
      assert.equal(o.headers.Authorization, "Bearer service-token");
      assert.equal(o.headers["Content-Type"], "video/mp4");
      assert.equal(o.headers["Content-Length"], "14", "length is sent so the body isn't chunked");
      assert.equal(o.duplex, "half");
      assert.ok(typeof o.body?.getReader === "function", "body is a stream, not a buffer");
    },
    body: { jobId: "job-1", did: "did:plc:me", state: "JOB_STATE_CREATED" },
  }]);
  const out = await lib.exports.startBlueskyVideoJob(startArgs);
  assert.deepEqual({ ...out }, { jobId: "job-1", accessJwt: "access-2", refreshJwt: "refresh-2" });
  assert.ok(!lib.requests.some((r) => r.url.pathname.endsWith("uploadBlob")), "never calls the PDS's 50 MB uploadBlob");
  assert.equal(lib.pendingNetwork.length, 0);
});

test("Bluesky: a video the service already processed (409) still yields its job ID", async () => {
  const lib = loadBlueskyLib([plc, refresh, serviceAuth, storageRead, {
    status: 409, body: { jobId: "job-old", state: "JOB_STATE_COMPLETED", error: "already_exists", message: "Video already processed" },
  }]);
  const out = await lib.exports.startBlueskyVideoJob(startArgs);
  assert.equal(out.jobId, "job-old");
});

test("Bluesky: an upload rejection surfaces the service's message", async () => {
  const lib = loadBlueskyLib([plc, refresh, serviceAuth, storageRead, {
    status: 400, body: { jobId: "", state: "", error: "unconfirmed_email", message: "Please confirm your email before uploading videos" },
  }]);
  await assert.rejects(lib.exports.startBlueskyVideoJob(startArgs), /400 Please confirm your email/);
});

// ── Phase 2a: job status ─────────────────────────────────────────────────────

test("Bluesky: job status maps completed, failed, in-progress and outages", async () => {
  const blob = { $type: "blob", ref: { $link: "bafy" }, mimeType: "video/mp4", size: 201269266 };
  const cases = [
    [{ body: { jobStatus: { jobId: "j", state: "JOB_STATE_COMPLETED", blob } } }, { status: "done", blob }],
    [{ body: { jobStatus: { jobId: "j", state: "JOB_STATE_ENCODING", progress: 40 } } }, { status: "processing" }],
    [{ status: 503, body: {} }, { status: "processing" }],
  ];
  for (const [response, expected] of cases) {
    const lib = loadBlueskyLib([{ inspect: (u, o) => {
      assert.equal(u.origin + u.pathname, "https://video.bsky.app/xrpc/app.bsky.video.getJobStatus");
      assert.equal(u.searchParams.get("jobId"), "job-1");
      assert.equal(o, undefined, "status checks need no token");
    }, ...response }]);
    assert.deepEqual(JSON.parse(JSON.stringify(await lib.exports.checkBlueskyVideoJob("job-1"))), expected);
  }

  const failed = loadBlueskyLib([{ body: { jobStatus: { jobId: "j", state: "JOB_STATE_FAILED", error: "bad_video", message: "Video is too long" } } }]);
  const res = await failed.exports.checkBlueskyVideoJob("job-1");
  assert.equal(res.status, "failed");
  assert.match(res.error, /Video is too long/);
});

// ── Worker ───────────────────────────────────────────────────────────────────

function loadWorker(db, network = []) {
  const noop = async () => {};
  return load("src/app/api/worker/run-scheduled/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabaseAdmin": { supabaseAdmin: db },
    "@/lib/youtubeUpload": { CATEGORY_IDS: {} },
    "@/lib/tiktokUpload": {},
    "@/lib/tiktok": {},
    "@/lib/facebookUpload": {},
    "@/lib/instagramUpload": {},
    "@/lib/linkedinUpload": {},
    "@/lib/xUpload": {},
    "@/lib/pinterestUpload": {},
    "@/lib/snapchatUpload": {},
    "@/lib/youtube": {},
    "@/lib/email": { sendPostSuccessEmail: noop, sendPostFailedEmail: noop, sendReconnectEmail: noop, sendGroupSummaryEmail: noop },
    "@/lib/postOptions": { blueskyExtras: () => ({}), tiktokPostInfoExtras: () => ({}), youtubeExtras: () => ({}), instagramContainerExtras: () => ({}), pinterestExtras: () => ({}) },
    "@/lib/blueskyUpload": loadBlueskyLib(network, db).exports,
  }, { env: { WORKER_SECRET: "s" } });
}

const workerReq = () => new Request("https://clipdash.test/api/worker/run-scheduled?token=s", { method: "POST" });

test("Worker: posts left in 'posting' by a killed run are failed, recent ones are left alone", async () => {
  let reaperQuery;
  const db = fakeDb({
    scheduled_posts: (q) => {
      if (q.payload?.status === "failed" && q.args.some(([op, col, v]) => op === "eq" && col === "status" && v === "posting")) {
        reaperQuery = q;
        return { data: [{ id: "stuck-1", user_id: "u", provider: "bluesky", group_id: null, title: "T" }], error: null };
      }
      return { data: [], error: null };
    },
    notification_preferences: () => ({ data: null, error: null }),
  });
  const worker = loadWorker(db);
  const res = await worker.exports.POST?.(workerReq()) ?? await worker.exports.GET(workerReq());
  assert.equal(res.status, 200);
  assert.ok(reaperQuery, "the worker runs the stuck-post cleanup");
  assert.match(reaperQuery.payload.last_error, /stopped before it finished/);
  const lt = reaperQuery.args.find(([op]) => op === "lt");
  assert.equal(lt[1], "ig_container_created_at", "age is measured from the claim time");
  const ageMinutes = (Date.now() - new Date(lt[2]).getTime()) / 60000;
  assert.ok(ageMinutes > 14 && ageMinutes < 16, `cutoff is ~15 minutes ago (was ${ageMinutes})`);
});

/** A due Bluesky video post whose upload has the given file_size. */
function dueBlueskyPostDb(fileSize) {
  return fakeDb({
    scheduled_posts: (q) => {
      // Due-post lookup (status in [...]) → one post; claim (update ... select) → claimed row
      if (q.ops.includes("lte") && !q.payload) {
        return { data: [{ id: "p1", user_id: "u", team_id: "t", upload_id: "up1", provider: "bluesky", status: "scheduled",
          platform_account_id: "acct-1", title: "Hello", description: "#fyp", bluesky_settings: {}, group_id: null }], error: null };
      }
      if (q.payload?.status === "posting") return { data: [{ id: "p1" }], error: null };
      return { data: [], error: null };
    },
    uploads: () => ({ data: { id: "up1", bucket: "clips", file_path: "u/clip.mp4", file_size: fileSize }, error: null }),
    platform_accounts: () => ({ data: { id: "acct-1", access_token: "access-1", refresh_token: "refresh-1", platform_user_id: "did:plc:me" }, error: null }),
    notification_preferences: () => ({ data: null, error: null }),
  });
}

for (const [label, size] of [["a 20 MB video", 20 * 1000 * 1000], ["an upload with no recorded size", null]]) {
  test(`Worker: ${label} still posts directly to the PDS in one run, as before`, async () => {
    const db = dueBlueskyPostDb(size);
    const worker = loadWorker(db, [
      plc, refresh,
      { inspect: (u) => assert.equal(u.origin + u.pathname, `${PDS}/xrpc/com.atproto.repo.uploadBlob`), body: { blob: { $type: "blob", mimeType: "video/mp4" } } },
      { inspect: (u) => assert.equal(u.pathname, "/xrpc/com.atproto.repo.createRecord"), body: { uri: "at://did:plc:me/app.bsky.feed.post/small", cid: "c" } },
    ]);
    const res = await worker.exports.GET(workerReq());
    assert.equal(res.status, 200);
    const posted = db.queries.find((q) => q.table === "scheduled_posts" && q.payload?.status === "posted");
    assert.equal(posted?.payload.platform_post_id, "at://did:plc:me/app.bsky.feed.post/small");
  });
}

test("Worker: a 192 MB video goes to the video service and waits in processing", async () => {
  const db = dueBlueskyPostDb(201269266);
  const worker = loadWorker(db, [plc, refresh, serviceAuth, storageRead,
    { inspect: (u) => assert.equal(u.host, "video.bsky.app"), body: { jobId: "job-big", state: "JOB_STATE_CREATED" } }]);
  const res = await worker.exports.GET(workerReq());
  assert.equal(res.status, 200);
  const parked = db.queries.find((q) => q.table === "scheduled_posts" && q.payload?.status === "ig_processing");
  assert.equal(parked?.payload.ig_container_id, "job-big");
  assert.ok(!db.queries.some((q) => q.payload?.status === "posted"), "not marked posted until the job finishes");
});

test("Worker: a finished Bluesky job is published and marked posted", async () => {
  const blob = { $type: "blob", ref: { $link: "bafy" }, mimeType: "video/mp4", size: 10 };
  const db = fakeDb({
    scheduled_posts: (q) => {
      if (q.args.some(([op, col, v]) => op === "eq" && col === "status" && v === "ig_processing") && q.ops.includes("select") && !q.payload) {
        return { data: [{ id: "p1", user_id: "u", provider: "bluesky", ig_container_id: "job-1", ig_container_created_at: new Date().toISOString(),
          bluesky_settings: {}, title: "Hello", description: "#fyp", group_id: null, upload_id: null, platform_account_id: "acct-1" }], error: null };
      }
      return { data: [], error: null };
    },
    platform_accounts: () => ({ data: { id: "acct-1", access_token: "access-1", refresh_token: "refresh-1", platform_user_id: "did:plc:me" }, error: null }),
    notification_preferences: () => ({ data: null, error: null }),
  });
  const worker = loadWorker(db, [
    { body: { jobStatus: { jobId: "job-1", state: "JOB_STATE_COMPLETED", blob } } },
    plc, refresh,
    { inspect: (u, o) => {
      assert.equal(u.origin + u.pathname, `${PDS}/xrpc/com.atproto.repo.createRecord`);
      const { record } = JSON.parse(o.body);
      assert.deepEqual(record.embed, { $type: "app.bsky.embed.video", video: blob });
      assert.equal(record.text, "Hello\n\n#fyp");
    }, body: { uri: "at://did:plc:me/app.bsky.feed.post/abc", cid: "c" } },
  ]);
  const res = await worker.exports.POST?.(workerReq()) ?? await worker.exports.GET(workerReq());
  assert.equal(res.status, 200);
  const posted = db.queries.find((q) => q.table === "scheduled_posts" && q.payload?.status === "posted");
  assert.ok(posted, "post marked posted");
  assert.equal(posted.payload.platform_post_id, "at://did:plc:me/app.bsky.feed.post/abc");
  const tokens = db.queries.find((q) => q.table === "platform_accounts" && q.payload?.refresh_token);
  assert.equal(tokens.payload.refresh_token, "refresh-2", "rotated Bluesky tokens are saved");
});
