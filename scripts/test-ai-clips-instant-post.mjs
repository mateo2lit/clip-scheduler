// Run: node --test scripts/test-ai-clips-instant-post.mjs
// AI Clips instant post: Post reserves the captioned upload before its render finishes, and the
// worker holds scheduled posts until their captions are ready. Loads the real code with mocked
// database and network; any unmocked import or network call fails the test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const renderGateModule = await import("../src/lib/renderGate.ts");

/** Minimal chainable Supabase stand-in: records every query and answers from `responses[table]`. */
function fakeDb(responses) {
  const queries = [];
  return {
    queries,
    storage: {
      from: () => ({
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
    exports, URL, URLSearchParams, Request, Response, Headers, Promise, Buffer, Uint8Array, Date, JSON, Math, crypto,
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
      return Response.json(next.body ?? {}, { status: next.status ?? 200 });
    },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return { exports, requests, pendingNetwork };
}

function loadWorker(db) {
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
    "@/lib/blueskyUpload": {},
    "@/lib/renderGate": renderGateModule,
  }, { env: { WORKER_SECRET: "s" } });
}

const workerReq = () => new Request("https://clipdash.test/api/worker/run-scheduled?token=s", { method: "POST" });
const eqArg = (q, col) => q.args.find(([op, c]) => op === "eq" && c === col)?.[2];

// ── Worker ───────────────────────────────────────────────────────────────────

function dueYoutubePostDb(upload) {
  return fakeDb({
    scheduled_posts: (q) => {
      if (q.ops.includes("lte") && !q.payload) {
        return { data: [{ id: "p1", user_id: "u", team_id: "t", upload_id: "up1", provider: "youtube", status: "scheduled",
          platform_account_id: "a1", title: "T", description: "", group_id: null }], error: null };
      }
      if (q.payload?.status === "posting") return { data: [{ id: "p1" }], error: null };
      return { data: [], error: null };
    },
    uploads: () => ({ data: { id: "up1", bucket: "clips", file_path: "t/x.mp4", file_size: 10, ...upload }, error: null }),
    notification_preferences: () => ({ data: null, error: null }),
  });
}

test("Worker: a post whose captions are still rendering is skipped and NOT claimed", async () => {
  const db = dueYoutubePostDb({ render_status: "rendering", render_started_at: new Date().toISOString() });
  const res = await loadWorker(db).exports.GET(workerReq());
  const body = await res.json();
  assert.equal(body.results[0].reason, "waiting_for_render");
  assert.ok(!db.queries.some((q) => q.payload?.status === "posting"), "not claimed");
});

test("Worker: a failed render fails the post with the captions message", async () => {
  const db = dueYoutubePostDb({ render_status: "failed", render_started_at: new Date().toISOString() });
  await loadWorker(db).exports.GET(workerReq());
  // eq id=p1 excludes the stuck-"posting" cleanup, which also writes status "failed"
  const failed = db.queries.find((q) => q.table === "scheduled_posts" && q.payload?.status === "failed" && eqArg(q, "id") === "p1");
  assert.ok(failed, "post marked failed");
  assert.match(failed.payload.last_error, /Captions couldn't be added/);
});

test("Worker: waiting posts don't use up the batch", async () => {
  // 6 rendering posts + 1 ready post due: the ready one must still be claimed.
  const posts = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, user_id: "u", team_id: "t", upload_id: i < 6 ? "busy" : "ready",
    provider: "youtube", status: "scheduled", platform_account_id: "a1", title: "T", description: "", group_id: null }));
  const claimed = [];
  const db = fakeDb({
    scheduled_posts: (q) => {
      if (q.ops.includes("lte") && !q.payload) return { data: posts, error: null };
      if (q.payload?.status === "posting") { const id = eqArg(q, "id"); claimed.push(id); return { data: [{ id }], error: null }; }
      return { data: [], error: null };
    },
    uploads: (q) => {
      const id = eqArg(q, "id");
      return { data: id === "busy" ? { id, render_status: "rendering", render_started_at: new Date().toISOString() }
        : { id, bucket: "clips", file_path: "t/x.mp4", render_status: null }, error: null };
    },
    platform_accounts: () => ({ data: null, error: null }),
    notification_preferences: () => ({ data: null, error: null }),
  });
  await loadWorker(db).exports.GET(workerReq());
  assert.deepEqual(claimed, ["p6"]);
});
