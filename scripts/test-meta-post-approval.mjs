// Run: node --test scripts/test-meta-post-approval.mjs
// Regression tests for fixes made after Meta App Review approval. Loads the real route code with
// mocked database, auth and Meta responses; any unmocked import or network call fails the test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal chainable Supabase stand-in: records every query and answers from `responses[table]`. */
function fakeDb(responses) {
  const queries = [];
  return {
    queries,
    from(table) {
      const q = { table, ops: [], payload: null };
      queries.push(q);
      const chain = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") {
            return (resolve, reject) => Promise.resolve(responses[table]?.(q) ?? { data: null, error: null }).then(resolve, reject);
          }
          return (...args) => {
            q.ops.push(prop);
            if (prop === "upsert" || prop === "update" || prop === "insert") q.payload = args[0];
            return chain;
          };
        },
      });
      return chain;
    },
  };
}

function loadRoute(relative, mocks, { network = [], env = {} } = {}) {
  const pendingNetwork = [...network];
  const requests = [];
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const exports = {};
  const context = vm.createContext({
    exports, URL, URLSearchParams, Request, Response, Headers, Promise,
    process: { env },
    console: { error() {}, warn() {}, log() {} },
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unmocked import blocked: ${specifier}`);
    },
    async fetch(url, options) {
      requests.push(String(url));
      const next = pendingNetwork.shift();
      if (!next) throw new Error(`Unmocked network call blocked: ${url}`);
      next.inspect?.(new URL(String(url)), options);
      return Response.json(next.body ?? {}, { status: next.status ?? 200 });
    },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return { exports, requests, pendingNetwork };
}

const redirects = { NextResponse: {
  redirect: (url) => ({ redirectedTo: String(url), cookies: { set() {} } }),
  json: (body, init) => Response.json(body, init),
} };

// ── Bug 3: Facebook keeps every granted Page ─────────────────────────────────

function facebookCallback(pages) {
  const db = fakeDb({
    team_members: () => ({ data: { team_id: "team-1", role: "owner" }, error: null }),
    platform_accounts: () => ({ data: null, error: null }),
  });
  const route = loadRoute("src/app/api/auth/facebook/callback/route.ts", {
    "next/server": redirects,
    "next/headers": { cookies: () => ({ get: () => undefined }) },
    "@/lib/supabaseAdmin": { supabaseAdmin: db },
    "@/lib/teamAuth": { requireOwnerOrAdmin: () => null },
    "@/lib/oauthState": { verifyOAuthState: () => "user-1" },
    "@/lib/facebook": {
      getFacebookAuthConfig: () => ({ appId: "app", appSecret: "secret", redirectUri: "https://example.invalid/cb" }),
      exchangeForLongLivedToken: async () => ({ access_token: "long-lived", expires_in: 5184000 }),
      getFacebookUserPages: async () => pages,
    },
  }, { network: [{ inspect: (u) => assert.equal(u.pathname, "/v21.0/oauth/access_token"), body: { access_token: "short" } }],
    env: { NEXT_PUBLIC_SITE_URL: "https://clipdash.test" } });
  const req = new Request("https://clipdash.test/api/auth/facebook/callback?code=abc&state=signed");
  return { db, run: () => route.exports.GET(req) };
}

test("Facebook: every granted Page is saved, not just the first", async () => {
  const { db, run } = facebookCallback([
    { id: "p1", name: "Main Page", access_token: "t1" },
    { id: "p2", name: "Second Page", access_token: "t2" },
    { id: "p3", name: "No token Page", access_token: "" },
  ]);
  const res = await run();
  assert.equal(res.redirectedTo, "https://clipdash.test/settings?connected=facebook");
  const upsert = db.queries.find((q) => q.table === "platform_accounts" && q.ops.includes("upsert"));
  assert.ok(Array.isArray(upsert.payload), "one upsert with a list of Pages");
  assert.deepEqual(upsert.payload.map((r) => [r.page_id, r.page_access_token, r.profile_name]),
    [["p1", "t1", "Main Page"], ["p2", "t2", "Second Page"]], "Pages without a token are skipped");
  assert.ok(upsert.payload.every((r) => r.team_id === "team-1" && r.provider === "facebook" && r.platform_user_id === r.page_id));
});

test("Facebook: a single granted Page behaves exactly as before", async () => {
  const { db, run } = facebookCallback([{ id: "demo", name: "Clip Dash Demo", access_token: "t" }]);
  await run();
  const upsert = db.queries.find((q) => q.table === "platform_accounts" && q.ops.includes("upsert"));
  assert.equal(upsert.payload.length, 1);
  assert.equal(upsert.payload[0].page_id, "demo");
});

test("Facebook: no usable Pages redirects with the no_pages error and saves nothing", async () => {
  const { db, run } = facebookCallback([{ id: "p", name: "x", access_token: "" }]);
  const res = await run();
  assert.equal(res.redirectedTo, "https://clipdash.test/settings?error=no_pages");
  assert.ok(!db.queries.some((q) => q.ops.includes("upsert")));
});

// ── Bug 1: Instagram follower counts use graph.instagram.com ─────────────────

test("Instagram followers are fetched from graph.instagram.com with the Instagram token", async () => {
  const db = fakeDb({
    platform_accounts: () => ({ data: [{ id: "acct-ig", team_id: "team-1", provider: "instagram",
      access_token: "IGAAtoken", ig_user_id: "178414" }], error: null }),
    follower_snapshots: () => ({ data: null, error: null }),
    competitor_profiles: () => ({ data: [], error: null }),
  });
  const route = loadRoute("src/app/api/worker/follower-snapshots/route.ts", {
    "next/server": redirects,
    "@/lib/supabaseAdmin": { supabaseAdmin: db },
    "@/lib/competitorFetchers": { fetchPublicProfile: async () => null },
  }, {
    env: { WORKER_SECRET: "s3cret" },
    network: [{
      inspect: (u) => {
        assert.equal(u.hostname, "graph.instagram.com");
        assert.equal(u.pathname, "/v21.0/me");
        assert.equal(u.searchParams.get("fields"), "followers_count");
        assert.equal(u.searchParams.get("access_token"), "IGAAtoken");
      },
      body: { followers_count: 1234, id: "178414" },
    }],
  });
  const res = await route.exports.POST(new Request("https://clipdash.test/api/worker/follower-snapshots", {
    method: "POST", headers: { authorization: "Bearer s3cret" } }));
  assert.equal(res.status, 200);
  const snap = db.queries.find((q) => q.table === "follower_snapshots");
  assert.equal(snap.payload.follower_count, 1234);
  assert.equal(snap.payload.provider, "instagram");
  assert.equal(route.pendingNetwork.length, 0);
});

// ── Bug 2: Instagram permalinks are used where links are built ───────────────

test("Link-in-bio uses a stored Instagram permalink, and older numeric IDs fall back to the profile", () => {
  const { exports } = loadRoute("src/lib/bioHelpers.ts", {});
  const acct = { profile_name: "novaplays" };
  assert.equal(exports.resolvePostPermalink("instagram", "https://www.instagram.com/reel/Cx1/", acct), "https://www.instagram.com/reel/Cx1/");
  assert.equal(exports.resolvePostPermalink("instagram", "18090943409148117", acct), "https://www.instagram.com/novaplays/");
});
