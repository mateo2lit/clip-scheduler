// Run: node --test scripts/test-stuck-posts-alert.mjs
// On 2026-10-17 the post worker was refused by a bad WORKER_SECRET and no posts went out for two
// days, with no error saved anywhere. /api/health/stuck-posts finds due posts still `scheduled`
// 15+ minutes later and emails the admin, at most once per window. It needs no secret, so a broken
// WORKER_SECRET can't silence it, and it answers with counts only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as stuckPosts from "../src/lib/stuckPosts.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOW = Date.parse("2026-10-19T03:00:00Z");
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();

test("counts only posts 15+ minutes overdue, and skips ones waiting on an AI Clips render", () => {
  const posts = [
    { scheduled_for: minutesAgo(16), upload_id: "u1" },
    { scheduled_for: minutesAgo(60 * 36), upload_id: "u2" },
    { scheduled_for: minutesAgo(14), upload_id: "u3" },
    { scheduled_for: minutesAgo(90), upload_id: "rendering-upload" },
  ];
  const summary = stuckPosts.summarizeStuckPosts(posts, new Set(["rendering-upload"]), NOW);
  assert.deepEqual(summary, { count: 2, oldestMinutes: 60 * 36 });
});

test("nothing overdue means no stuck posts", () => {
  assert.deepEqual(stuckPosts.summarizeStuckPosts([], new Set(), NOW), { count: 0, oldestMinutes: 0 });
});

/** Chainable stand-in for supabaseAdmin that records each query's calls. */
function fakeDb({ posts = [], rendering = [], claimed = [{ key: "stuck_posts" }], claimError = null } = {}) {
  const calls = [];
  const answer = (table) => {
    if (table === "scheduled_posts") return { data: posts, error: null };
    if (table === "uploads") return { data: rendering.map((id) => ({ id })), error: null };
    if (table === "system_alerts") return { data: claimError ? null : claimed, error: claimError };
    throw new Error(`unexpected table ${table}`);
  };
  return {
    calls,
    from(table) {
      const ops = [];
      calls.push({ table, ops });
      const builder = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") return (resolve, reject) => Promise.resolve(answer(table)).then(resolve, reject);
          return (...args) => { ops.push([prop, ...args]); return builder; };
        },
      });
      return builder;
    },
  };
}

function loadRoute(db) {
  const relative = "src/app/api/health/stuck-posts/route.ts";
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const emails = [];
  const mocks = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabaseAdmin": { supabaseAdmin: db },
    "@/lib/email": { sendStuckPostsAlertEmail: async (...args) => { emails.push(args); } },
    "@/lib/stuckPosts": stuckPosts,
  };
  const FixedDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  };
  const exports = {};
  const context = vm.createContext({
    exports, Response, Promise, Set, Date: FixedDate,
    process: { env: {} },
    console: { error() {}, warn() {}, log() {} },
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unmocked import blocked: ${specifier}`);
    },
    fetch() { throw new Error("Unmocked network call blocked"); },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return { route: exports, emails };
}

test("healthy: answers 200 and sends nothing", async () => {
  const db = fakeDb({ posts: [] });
  const { route, emails } = loadRoute(db);
  const res = await route.GET(new Request("https://clipdash.test/api/health/stuck-posts"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, stuck: 0, oldest_minutes: 0, alerted: false });
  assert.equal(emails.length, 0);
  assert.ok(!db.calls.some((c) => c.table === "system_alerts"));
});

test("stuck: answers 503, claims the alert window, and emails once with the count", async () => {
  const db = fakeDb({ posts: [{ scheduled_for: minutesAgo(20), upload_id: null }, { scheduled_for: minutesAgo(45), upload_id: "u1" }] });
  const { route, emails } = loadRoute(db);
  const res = await route.GET(new Request("https://clipdash.test/api/health/stuck-posts"));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { ok: false, stuck: 2, oldest_minutes: 45, alerted: true });
  assert.deepEqual(emails, [[2, 45]]);

  const due = db.calls.find((c) => c.table === "scheduled_posts").ops;
  assert.ok(due.some(([op, col, val]) => op === "eq" && col === "status" && val === "scheduled"));
  assert.ok(due.some(([op, col, val]) => op === "lt" && col === "scheduled_for" && val === minutesAgo(15)));

  const claim = db.calls.find((c) => c.table === "system_alerts").ops;
  assert.ok(claim.some(([op, col, val]) => op === "eq" && col === "key" && val === "stuck_posts"));
  assert.ok(claim.some(([op, col, val]) => op === "lt" && col === "last_sent_at" && val === minutesAgo(6 * 60)),
    "only claims when the last alert is 6+ hours old");
});

test("stuck but already alerted this window: no second email", async () => {
  const db = fakeDb({ posts: [{ scheduled_for: minutesAgo(20), upload_id: null }], claimed: [] });
  const { route, emails } = loadRoute(db);
  const res = await route.GET(new Request("https://clipdash.test/api/health/stuck-posts"));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).alerted, false);
  assert.equal(emails.length, 0);
});

test("if the throttle table is missing, it doesn't email (no spam every 10 minutes) and says why", async () => {
  const db = fakeDb({ posts: [{ scheduled_for: minutesAgo(20), upload_id: null }], claimError: { message: "relation \"system_alerts\" does not exist" } });
  const { route, emails } = loadRoute(db);
  const res = await route.GET(new Request("https://clipdash.test/api/health/stuck-posts"));
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(body.alerted, false);
  assert.match(body.alert_error, /system_alerts/);
  assert.equal(emails.length, 0);
});

test("route reads no secret: it must keep working when WORKER_SECRET is wrong", () => {
  const source = fs.readFileSync(path.join(root, "src/app/api/health/stuck-posts/route.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { removeComments: true } }).outputText;
  assert.doesNotMatch(code, /WORKER_SECRET|CRON_SECRET|workerSecret|authorization/i);
});
