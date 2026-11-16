// Run: node --test scripts/test-admin-stats.mjs
// /api/admin/stats is a read-only, totals-only endpoint an outside analyst bot fetches by URL.
// These tests load the real route code with a mocked database and a mocked GA4 client, and check
// that it fails closed, answers only with totals (no ids, emails, names, tokens, titles), leaves out
// internal teams, and that GA4 and the database fail separately.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "src/app/api/admin/stats/route.ts";
const NOW = Date.parse("2026-11-16T12:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

const SECRET = "s3cret-stats-key";
const TEST_TEAM = "aaaaaaaa-0000-4000-8000-000000000001";
const REVIEW_TEAM = "aaaaaaaa-0000-4000-8000-000000000002";
const T1 = "bbbbbbbb-0000-4000-8000-000000000001";
const T2 = "bbbbbbbb-0000-4000-8000-000000000002";
const T3 = "bbbbbbbb-0000-4000-8000-000000000003";
const T4 = "bbbbbbbb-0000-4000-8000-000000000004";

// Rows carry the kind of private fields the real tables have, so leaks would show up in the output.
function sampleTables() {
  const teams = [
    { id: T1, name: "Pat Example's Team", owner_email: "pat@example.com", created_at: daysAgo(1), plan: "creator", plan_status: "active" },
    { id: T2, name: "Sam Sample", owner_email: "sam@example.org", created_at: daysAgo(6), plan: "team", plan_status: "trialing" },
    { id: T3, name: "Lee Person", owner_email: "lee@example.net", created_at: daysAgo(10), plan: null, plan_status: null },
    { id: T4, name: "Old Team", owner_email: "old@example.com", created_at: daysAgo(300), plan: "none", plan_status: "canceled" },
    { id: TEST_TEAM, name: "Internal Test", owner_email: "test@example.com", created_at: daysAgo(2), plan: "team", plan_status: "active" },
    { id: REVIEW_TEAM, name: "Reviewer", owner_email: "review@example.com", created_at: daysAgo(9), plan: "creator", plan_status: "active" },
  ];
  const acct = (n, team_id, provider) => ({
    id: `acct-${n}`, team_id, provider, access_token: `tok-secret-${n}`, profile_name: `Profile Name ${n}`, platform_user_id: `puid-${n}`,
  });
  const platform_accounts = [
    acct(1, T1, "youtube"), acct(2, T1, "tiktok"), acct(3, T2, "youtube"), acct(4, T3, "bluesky"),
    acct(5, TEST_TEAM, "youtube"), acct(6, REVIEW_TEAM, "instagram"),
  ];
  const post = (n, team_id, provider, status, when) => ({
    id: `post-${n}`, team_id, provider, status, title: `Private Title ${n}`, last_error: status === "failed" ? `token for user ${n} expired` : null,
    posted_at: status === "posted" ? when : null, scheduled_for: when,
  });
  const scheduled_posts = [
    post(1, T1, "youtube", "posted", daysAgo(1)),
    post(2, T1, "tiktok", "posted", daysAgo(2)),
    post(3, T2, "youtube", "posted", daysAgo(3)),
    post(4, T2, "x", "failed", daysAgo(3)),
    post(5, T1, "youtube", "posted", daysAgo(8)),
    post(6, T3, "bluesky", "failed", daysAgo(9)),
    post(7, T3, "bluesky", "failed", daysAgo(10)),
    post(8, null, "youtube", "posted", daysAgo(2)), // legacy row without a team: still counted
    post(9, TEST_TEAM, "youtube", "posted", daysAgo(1)),
    post(10, TEST_TEAM, "youtube", "failed", daysAgo(1)),
    post(11, REVIEW_TEAM, "instagram", "posted", daysAgo(9)),
    post(12, T1, "youtube", "scheduled", daysAgo(-1)),
    post(13, T1, "youtube", "posted", daysAgo(30)),
  ];
  const job = (n, team_id, status, minutes, when) => ({
    id: `job-${n}`, team_id, status, source_duration_minutes: minutes, created_at: when, source_file_path: `team/${team_id}/secret-file-${n}.mp4`,
  });
  const ai_clip_jobs = [
    job(1, T1, "done", 12.5, daysAgo(1)),
    job(2, T2, "failed", 30, daysAgo(2)),
    job(3, T1, "done", 4, daysAgo(10)),
    job(4, TEST_TEAM, "done", 100, daysAgo(1)),
  ];
  return { teams, platform_accounts, scheduled_posts, ai_clip_jobs };
}

/** In-memory stand-in for the Supabase query builder, covering the filters the route uses. */
function fakeDb(tables, { errors = {} } = {}) {
  const calls = [];
  const inList = (s) => s.replace(/^\(|\)$/g, "").split(",").filter(Boolean);
  return {
    calls,
    from(table) {
      const q = { table, cols: null, head: false, count: false, filters: [], range: null };
      calls.push(q);
      const builder = {
        select(cols, opts = {}) { q.cols = cols.split(",").map((c) => c.trim()); q.head = !!opts.head; q.count = opts.count === "exact"; return builder; },
        eq(c, v) { q.filters.push((r) => r[c] === v); return builder; },
        gte(c, v) { q.filters.push((r) => r[c] != null && r[c] >= v); return builder; },
        lt(c, v) { q.filters.push((r) => r[c] != null && r[c] < v); return builder; },
        not(c, op, v) {
          assert.equal(op, "in");
          const list = inList(v);
          q.filters.push((r) => r[c] != null && !list.includes(r[c]));
          return builder;
        },
        or(expr) {
          const m = /^(\w+)\.is\.null,(\w+)\.not\.in\.(\(.*\))$/.exec(expr);
          assert.ok(m && m[1] === m[2], `unsupported or(): ${expr}`);
          const list = inList(m[3]);
          q.filters.push((r) => r[m[1]] == null || !list.includes(r[m[1]]));
          return builder;
        },
        order() { return builder; },
        range(from, to) { q.range = [from, to]; return builder; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (errors[table]) return { data: null, count: null, error: errors[table] };
            if (!tables[table]) throw new Error(`unexpected table ${table}`);
            const rows = tables[table].filter((r) => q.filters.every((f) => f(r)));
            if (q.head) return { data: null, count: rows.length, error: null };
            const page = q.range ? rows.slice(q.range[0], q.range[1] + 1) : rows.slice(0, 1000);
            return { data: page.map((r) => Object.fromEntries(q.cols.map((c) => [c, r[c]]))), error: null };
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const GA_CURRENT = { sessions: 1200, totalUsers: 900, newUsers: 700, engagementRate: 0.612345, keyEvents: 40, conversions: 41 };
const GA_PREVIOUS = { sessions: 1000, totalUsers: 800, newUsers: 650, engagementRate: 0.55, keyEvents: 30, conversions: 31 };
const GA_BREAKDOWNS = {
  sessionDefaultChannelGroup: [["Organic Search", 600, 500], ["Direct", 400, 300], ["Referral", 200, 200]],
  sessionSource: Array.from({ length: 12 }, (_, i) => [`source${i + 1}`, 120 - i * 10, 50]),
  landingPage: Array.from({ length: 12 }, (_, i) => [`/page-${i + 1}`, 200 - i * 10, 90]),
};

function fakeGoogle({ badMetrics = [], failWith = null } = {}) {
  const seen = { jwt: null, version: null, requests: [] };
  const report = (body) => {
    const dims = (body.dimensions ?? []).map((d) => d.name);
    const mets = body.metrics.map((m) => m.name);
    if (mets.some((m) => badMetrics.includes(m))) {
      const e = new Error(`Field ${mets[0]} is not a valid metric for property 999`);
      e.code = 400;
      throw e;
    }
    if (!dims.length) {
      return {
        dimensionHeaders: [{ name: "dateRange" }],
        rows: [
          { dimensionValues: [{ value: "current" }], metricValues: mets.map((m) => ({ value: String(GA_CURRENT[m]) })) },
          { dimensionValues: [{ value: "previous" }], metricValues: mets.map((m) => ({ value: String(GA_PREVIOUS[m]) })) },
        ],
      };
    }
    return {
      dimensionHeaders: [{ name: dims[0] }, { name: "dateRange" }],
      rows: GA_BREAKDOWNS[dims[0]].flatMap(([key, cur, prev]) => [
        { dimensionValues: [{ value: key }, { value: "current" }], metricValues: [{ value: String(cur) }] },
        { dimensionValues: [{ value: key }, { value: "previous" }], metricValues: [{ value: String(prev) }] },
      ]),
    };
  };
  const module = {
    google: {
      auth: { JWT: class { constructor(opts) { seen.jwt = opts; } } },
      analyticsdata(opts) {
        seen.version = opts.version;
        return {
          properties: {
            async runReport(params) {
              seen.requests.push(params);
              if (failWith) throw failWith;
              return { data: report(params.requestBody) };
            },
          },
        };
      },
    },
  };
  return { seen, module };
}

const GA_ENV = {
  GA4_PROPERTY_ID: " 123456789 ",
  GA4_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account",
    client_email: "stats-bot@example-project.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\\nMIIfakekey\\n-----END PRIVATE KEY-----\\n",
  }),
};

/** Loads the route and the modules it imports (transpiled) inside a sandbox with mocked externals. */
function loadRoute({ env = {}, db = fakeDb(sampleTables()), dbMissing = false, google = null } = {}) {
  const FixedDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  };
  const logs = [];
  const context = vm.createContext({
    Response, URL, Promise, Date: FixedDate,
    process: { env: { ...env } },
    console: { error: (...a) => logs.push(a), warn() {}, log() {} },
    fetch() { throw new Error("Unmocked network call blocked"); },
  });
  const googleapis = google?.module ?? {
    google: {
      auth: { JWT: class { constructor() { throw new Error("GA4 client should not be created"); } } },
      analyticsdata() { throw new Error("GA4 client should not be created"); },
    },
  };
  const external = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    crypto,
    googleapis,
  };
  const cache = new Map();
  function load(rel) {
    if (cache.has(rel)) return cache.get(rel).exports;
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: rel,
    }).outputText;
    const module = { exports: {} };
    cache.set(rel, module);
    const fn = new vm.Script(`(function (exports, require, module) {\n${compiled}\n})`, { filename: rel }).runInContext(context);
    fn(module.exports, (spec) => resolve(spec, rel), module);
    return module.exports;
  }
  function resolve(spec, from) {
    if (spec === "@/lib/supabaseAdmin") {
      if (dbMissing) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
      return { supabaseAdmin: db };
    }
    if (Object.hasOwn(external, spec)) return external[spec];
    if (spec.startsWith("@/")) return load(`src/${spec.slice(2)}.ts`);
    if (spec.startsWith("./")) return load(`${path.posix.dirname(from)}/${spec.slice(2)}.ts`);
    throw new Error(`Unmocked import blocked: ${spec}`);
  }
  return { route: load(ROUTE), load, logs };
}

async function call(opts, { query = `?key=${SECRET}`, headers = {} } = {}) {
  const { route } = loadRoute(opts);
  const res = await route.GET(new Request(`https://clipdash.test/api/admin/stats${query}`, { headers }));
  return { res, body: await res.json() };
}

const ENV = { STATS_API_SECRET: SECRET };
const plain = (v) => JSON.parse(JSON.stringify(v)); // objects made inside the sandbox have its own prototypes

// --- auth ------------------------------------------------------------------------------------

test("fails closed: unset or blank STATS_API_SECRET answers 503 and reads nothing", async () => {
  for (const env of [{}, { STATS_API_SECRET: "   \n" }]) {
    const db = fakeDb(sampleTables());
    const { res, body } = await call({ env, db });
    assert.equal(res.status, 503);
    assert.deepEqual(body, { ok: false, error: "not configured" });
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(db.calls.length, 0);
  }
});

test("wrong or missing key answers 401 and reads nothing", async () => {
  for (const query of ["", "?key=nope", `?key=${SECRET}x`, "?key="]) {
    const db = fakeDb(sampleTables());
    const { res, body } = await call({ env: ENV, db }, { query });
    assert.equal(res.status, 401, `query ${query}`);
    assert.deepEqual(body, { ok: false, error: "unauthorized" });
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(db.calls.length, 0);
  }
  const { res } = await call({ env: ENV }, { query: "", headers: { authorization: "Bearer wrong" } });
  assert.equal(res.status, 401);
});

test("right key works as ?key= (env value trimmed) and as a Bearer token", async () => {
  const viaQuery = await call({ env: { STATS_API_SECRET: ` ${SECRET}\n` } });
  assert.equal(viaQuery.res.status, 200);
  assert.equal(viaQuery.body.ok, true);
  assert.equal(viaQuery.res.headers.get("cache-control"), "no-store");

  const viaBearer = await call({ env: ENV }, { query: "", headers: { authorization: `Bearer ${SECRET}` } });
  assert.equal(viaBearer.res.status, 200);
  assert.equal(viaBearer.body.ok, true);
});

// --- period ----------------------------------------------------------------------------------

test("days defaults to 7 and is clamped to 1..90; previous period is the same length right before", async () => {
  const cases = [["", 7], ["&days=abc", 7], ["&days=0", 1], ["&days=-5", 1], ["&days=30", 30], ["&days=500", 90], ["&days=14.9", 14]];
  for (const [extra, days] of cases) {
    const { body } = await call({ env: ENV }, { query: `?key=${SECRET}${extra}` });
    assert.equal(body.period.days, days, extra);
    assert.equal(body.period.end, new Date(NOW).toISOString());
    assert.equal(body.period.start, daysAgo(days));
    assert.equal(body.period.previous_end, daysAgo(days));
    assert.equal(body.period.previous_start, daysAgo(2 * days));
  }
});

// --- product ---------------------------------------------------------------------------------

test("product totals are right and leave out excluded teams everywhere", async () => {
  const { body } = await call({ env: { ...ENV, STATS_EXCLUDE_TEAM_IDS: `${TEST_TEAM}, ${REVIEW_TEAM} ,` } });
  const p = body.product;
  assert.equal(p.ok, true);
  assert.equal(p.excluded_team_count, 2);
  assert.deepEqual(p.signups, { current: 2, previous: 1 });
  assert.deepEqual(p.teams_snapshot, {
    total: 4,
    by_plan: { creator: 1, none: 2, team: 1 },
    by_status: { active: 1, canceled: 1, none: 1, trialing: 1 },
    by_plan_status: { creator: { active: 1 }, team: { trialing: 1 }, none: { none: 1, canceled: 1 } },
  });
  assert.deepEqual(p.connected_accounts_snapshot, { total: 4, by_provider: { youtube: 2, bluesky: 1, tiktok: 1 } });
  assert.deepEqual(p.posts_published, {
    current: { total: 4, by_provider: { youtube: 3, tiktok: 1 } },
    previous: { total: 1, by_provider: { youtube: 1 } },
  });
  assert.deepEqual(p.posts_failed, {
    current: { total: 1, by_provider: { x: 1 } },
    previous: { total: 2, by_provider: { bluesky: 2 } },
  });
  assert.deepEqual(p.post_failure_rate, { current: 0.2, previous: 0.6667 });
  assert.deepEqual(p.ai_clips, {
    current: { jobs: 2, by_status: { done: 1, failed: 1 }, minutes_submitted: 42.5, minutes_completed: 12.5 },
    previous: { jobs: 1, by_status: { done: 1 }, minutes_submitted: 4, minutes_completed: 4 },
  });
});

test("without STATS_EXCLUDE_TEAM_IDS the internal teams are counted", async () => {
  const { body } = await call({ env: ENV });
  assert.equal(body.product.excluded_team_count, 0);
  assert.deepEqual(body.product.signups, { current: 3, previous: 2 });
  assert.equal(body.product.teams_snapshot.total, 6);
  assert.equal(body.product.posts_published.current.total, 5);
  assert.equal(body.product.ai_clips.current.minutes_submitted, 142.5);
});

test("the response holds no emails, ids, tokens, names, titles, errors or file paths from the data", async () => {
  const google = fakeGoogle();
  const { body } = await call({ env: { ...ENV, ...GA_ENV, STATS_EXCLUDE_TEAM_IDS: TEST_TEAM }, google });
  assert.equal(body.ga4.ok, true);
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[\w.-]+/, "no email-like strings");
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "no uuids");
  const t = sampleTables();
  const privateValues = [
    ...t.teams.flatMap((r) => [r.id, r.name, r.owner_email]),
    ...t.platform_accounts.flatMap((r) => [r.id, r.access_token, r.profile_name, r.platform_user_id]),
    ...t.scheduled_posts.flatMap((r) => [r.id, r.title, r.last_error]).filter(Boolean),
    ...t.ai_clip_jobs.flatMap((r) => [r.id, r.source_file_path]),
    "MIIfakekey", "PRIVATE KEY", SECRET,
  ];
  for (const v of privateValues) assert.ok(!text.includes(v), `leaked: ${v}`);
});

test("pages through more than 1000 rows instead of stopping at the first page", async () => {
  const tables = sampleTables();
  tables.platform_accounts = Array.from({ length: 2500 }, (_, i) => ({ id: `a${i}`, team_id: T1, provider: i % 2 ? "youtube" : "tiktok" }));
  const db = fakeDb(tables);
  const { body } = await call({ env: ENV, db });
  assert.deepEqual(body.product.connected_accounts_snapshot, { total: 2500, by_provider: { tiktok: 1250, youtube: 1250 } });
  const pages = db.calls.filter((c) => c.table === "platform_accounts").map((c) => c.range);
  assert.deepEqual(pages, [[0, 999], [1000, 1999], [2000, 2999]]);
  for (const c of db.calls.filter((c) => !c.head)) {
    assert.ok(!c.cols.includes("*") && c.cols.every((col) => ["plan", "plan_status", "provider", "status", "source_duration_minutes"].includes(col)),
      `narrow select only, got ${c.table}: ${c.cols}`);
  }
});

test("one failing product query fails only that metric, with a short error", async () => {
  const db = fakeDb(sampleTables(), { errors: { ai_clip_jobs: { code: "42P01", message: 'relation "ai_clip_jobs" does not exist' } } });
  const { res, body } = await call({ env: ENV, db });
  assert.equal(res.status, 200);
  assert.equal(body.product.ok, true);
  assert.deepEqual(body.product.ai_clips.current, { ok: false, error: "query failed (42P01)" });
  assert.equal(body.product.signups.current, 3);
});

test("database unavailable: product is ok:false, GA4 still answers, status 200", async () => {
  const google = fakeGoogle();
  const { res, body } = await call({ env: { ...ENV, ...GA_ENV }, dbMissing: true, google });
  assert.equal(res.status, 200);
  assert.deepEqual(body.product, { ok: false, error: "database unavailable" });
  assert.equal(body.ga4.ok, true);
});

// --- GA4 -------------------------------------------------------------------------------------

test("GA4 env missing: ga4 is ok:false with a reason, product still answers", async () => {
  const { res, body } = await call({ env: ENV });
  assert.equal(res.status, 200);
  assert.deepEqual(body.ga4, { ok: false, error: "GA4_PROPERTY_ID is not set" });
  assert.equal(body.product.ok, true);
  assert.equal(typeof body.definitions, "object");

  const noKey = await call({ env: { ...ENV, GA4_PROPERTY_ID: "123" } });
  assert.deepEqual(noKey.body.ga4, { ok: false, error: "GA4_SERVICE_ACCOUNT_JSON is not set" });
});

test("GA4 key that isn't valid JSON gives a clear error without echoing the value", async () => {
  const { body } = await call({ env: { ...ENV, GA4_PROPERTY_ID: "123", GA4_SERVICE_ACCOUNT_JSON: "{oops SUPER-PRIVATE-VALUE" } });
  assert.deepEqual(body.ga4, { ok: false, error: "GA4_SERVICE_ACCOUNT_JSON is not valid JSON" });
  assert.ok(!JSON.stringify(body).includes("SUPER-PRIVATE-VALUE"));
});

test("GA4 report: both periods in one request, totals, channels, top 10 sources and pages", async () => {
  const google = fakeGoogle();
  const { body } = await call({ env: { ...ENV, ...GA_ENV } }, {});
  assert.equal(body.ga4.ok, false, "sanity: no google mock means no GA4 call");

  const { body: b } = await call({ env: { ...ENV, ...GA_ENV }, google }, { query: `?key=${SECRET}&days=7` });
  const g = b.ga4;
  assert.equal(g.ok, true);
  assert.equal(google.seen.version, "v1beta");
  assert.deepEqual(plain(google.seen.jwt.scopes), ["https://www.googleapis.com/auth/analytics.readonly"]);
  assert.equal(google.seen.jwt.key, "-----BEGIN PRIVATE KEY-----\nMIIfakekey\n-----END PRIVATE KEY-----\n", "literal \\n turned into line breaks");
  for (const r of google.seen.requests) {
    assert.equal(r.property, "properties/123456789");
    assert.deepEqual(plain(r.requestBody.dateRanges), [
      { startDate: "6daysAgo", endDate: "today", name: "current" },
      { startDate: "13daysAgo", endDate: "7daysAgo", name: "previous" },
    ]);
  }
  assert.deepEqual(g.date_ranges, { current: { startDate: "6daysAgo", endDate: "today" }, previous: { startDate: "13daysAgo", endDate: "7daysAgo" } });
  assert.deepEqual(g.totals, {
    current: { sessions: 1200, total_users: 900, new_users: 700, engagement_rate: 0.6123, key_events: 40 },
    previous: { sessions: 1000, total_users: 800, new_users: 650, engagement_rate: 0.55, key_events: 30 },
  });
  assert.deepEqual(g.channels[0], { channel: "Organic Search", sessions_current: 600, sessions_previous: 500 });
  assert.equal(g.channels.length, 3);
  assert.equal(g.top_sources.length, 10);
  assert.deepEqual(g.top_sources[0], { source: "source1", sessions_current: 120, sessions_previous: 50 });
  assert.equal(g.top_landing_pages.length, 10);
  assert.deepEqual(g.top_landing_pages[0], { page: "/page-1", sessions_current: 200, sessions_previous: 90 });
  assert.equal(g.skipped_metrics, undefined);
});

test("days=1 maps to today vs yesterday in GA4", async () => {
  const google = fakeGoogle();
  const { body } = await call({ env: { ...ENV, ...GA_ENV }, google }, { query: `?key=${SECRET}&days=1` });
  assert.deepEqual(body.ga4.date_ranges, { current: { startDate: "today", endDate: "today" }, previous: { startDate: "1daysAgo", endDate: "yesterday" } });
});

test("key events fall back to the older 'conversions' metric, and are skipped if neither works", async () => {
  const fallback = fakeGoogle({ badMetrics: ["keyEvents"] });
  const a = await call({ env: { ...ENV, ...GA_ENV }, google: fallback });
  assert.equal(a.body.ga4.totals.current.key_events, 41);
  assert.equal(a.body.ga4.skipped_metrics, undefined);

  const neither = fakeGoogle({ badMetrics: ["keyEvents", "conversions"] });
  const b = await call({ env: { ...ENV, ...GA_ENV }, google: neither });
  assert.equal(b.body.ga4.ok, true);
  assert.equal(b.body.ga4.totals.current.key_events, undefined);
  assert.deepEqual(b.body.ga4.skipped_metrics, ["key_events"]);
  assert.equal(b.body.ga4.totals.current.sessions, 1200);
});

test("GA4 API error: ga4 is ok:false with only the status, product still answers", async () => {
  const err = Object.assign(new Error("User stats-bot@example-project.iam.gserviceaccount.com lacks permission on property 123456789"), { code: 403 });
  const google = fakeGoogle({ failWith: err });
  const { res, body } = await call({ env: { ...ENV, ...GA_ENV }, google });
  assert.equal(res.status, 200);
  assert.deepEqual(body.ga4, { ok: false, error: "GA4 request failed (403)" });
  assert.equal(body.product.ok, true);
});

// --- source rules ----------------------------------------------------------------------------

test("STATS_API_SECRET is read only through src/lib/statsSecret.ts, and the route never reads worker secrets", () => {
  const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? files(full) : /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
  const offenders = files(path.join(root, "src"))
    .map((f) => path.relative(root, f).split(path.sep).join("/"))
    .filter((f) => f !== "src/lib/statsSecret.ts")
    .filter((f) => /process\.env\.STATS_API_SECRET|["']STATS_API_SECRET["']/.test(fs.readFileSync(path.join(root, f), "utf8")));
  assert.deepEqual(offenders, []);
  const route = fs.readFileSync(path.join(root, ROUTE), "utf8");
  assert.doesNotMatch(route, /WORKER_SECRET|CRON_SECRET|workerSecret|STRIPE/);
});
