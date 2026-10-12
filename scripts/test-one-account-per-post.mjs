// Run: node --test scripts/test-one-account-per-post.mjs
// X forbids posting the same content on several accounts, so the create route refuses a
// second X row in the same post group. Loads the real route with a mocked database; any
// unmocked import fails the test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function compile(relative) {
  return ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
}

function loadModule(relative, mocks) {
  const exports = {};
  const context = vm.createContext({
    exports, Request, Response, Promise, Date, JSON, String, Object,
    console: { error() {}, warn() {}, log() {} },
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unmocked import blocked: ${specifier}`);
    },
  });
  new vm.Script(compile(relative), { filename: relative }).runInContext(context, { timeout: 3000 });
  return exports;
}

/** Chainable Supabase stand-in. `existing` are the scheduled_posts rows already in the database. */
function fakeDb(existing) {
  const queries = [];
  return {
    queries,
    from(table) {
      const q = { table, args: [], insert: null };
      queries.push(q);
      const answer = () => {
        if (table === "teams") return { data: { plan_status: "active" }, error: null };
        if (q.insert) return { data: { id: "new-row", ...q.insert[0] }, error: null };
        const eq = Object.fromEntries(q.args.filter(([op]) => op === "eq").map(([, c, v]) => [c, v]));
        const rows = existing.filter((r) => Object.entries(eq).every(([c, v]) => r[c] === v));
        return { data: rows.map((r) => ({ id: r.id })), error: null };
      };
      const chain = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") return (resolve, reject) => Promise.resolve(answer()).then(resolve, reject);
          return (...args) => {
            q.args.push([prop, ...args]);
            if (prop === "insert") q.insert = args[0];
            return chain;
          };
        },
      });
      return chain;
    },
  };
}

function loadRoute(db) {
  const accountLimits = loadModule("src/lib/accountLimits.ts", {});
  const settings = loadModule("src/lib/scheduledPostSettings.ts", {});
  return loadModule("src/app/api/scheduled-posts/create/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabaseAdmin": { supabaseAdmin: db },
    "@/lib/teamAuth": { getTeamContext: async () => ({ ok: true, ctx: { teamId: "t", userId: "u", role: "owner" } }) },
    "@/lib/scheduledPostSettings": settings,
    "@/lib/accountLimits": accountLimits,
  });
}

const post = (over) => ({
  group_id: "g1", provider: "x", platform_account_id: "acct-2", upload_id: "up1",
  scheduled_for: "2026-10-12T15:00:00.000Z", status: "scheduled", title: "Clip", description: "Hello",
  ...over,
});

async function create(db, body) {
  const res = await loadRoute(db).POST(
    new Request("https://clipdash.test/api/scheduled-posts/create", { method: "POST", body: JSON.stringify(body) }),
  );
  return { status: res.status, body: await res.json() };
}

const inserted = (db) => db.queries.some((q) => q.insert);

test("the first X post in a group is created", async () => {
  const db = fakeDb([]);
  const out = await create(db, post());
  assert.equal(out.status, 200);
  assert.equal(out.body.scheduledPost.provider, "x");
  assert.ok(inserted(db));
});

test("a second X account in the same group is refused with the reason", async () => {
  const db = fakeDb([{ id: "r1", team_id: "t", group_id: "g1", provider: "x" }]);
  const out = await create(db, post());
  assert.equal(out.status, 409);
  assert.match(out.body.error, /one X account at a time/);
  assert.ok(!inserted(db), "nothing may be inserted");
});

test("drafts follow the same rule", async () => {
  const db = fakeDb([{ id: "r1", team_id: "t", group_id: "g1", provider: "x" }]);
  const out = await create(db, post({ status: "draft" }));
  assert.equal(out.status, 409);
  assert.ok(!inserted(db));
});

test("X alongside other platforms in the group is fine", async () => {
  const db = fakeDb([
    { id: "r1", team_id: "t", group_id: "g1", provider: "youtube" },
    { id: "r2", team_id: "t", group_id: "g1", provider: "bluesky" },
  ]);
  const out = await create(db, post());
  assert.equal(out.status, 200);
});

test("other platforms may still go to several accounts in one group", async () => {
  const db = fakeDb([{ id: "r1", team_id: "t", group_id: "g1", provider: "youtube" }]);
  const out = await create(db, post({ provider: "youtube" }));
  assert.equal(out.status, 200);
  assert.ok(inserted(db));
});

test("a group id from another team doesn't block this team's post", async () => {
  const db = fakeDb([{ id: "r1", team_id: "other-team", group_id: "g1", provider: "x" }]);
  const out = await create(db, post());
  assert.equal(out.status, 200);
});

test("an X text post is checked too", async () => {
  const db = fakeDb([{ id: "r1", team_id: "t", group_id: "g1", provider: "x" }]);
  const out = await create(db, post({ post_type: "text", upload_id: undefined, text_post_content: { body: "hi" } }));
  assert.equal(out.status, 409);
});
