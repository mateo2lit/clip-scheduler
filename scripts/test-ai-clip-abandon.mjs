// Run: node --test scripts/test-ai-clip-abandon.mjs
// AI Clips abandon: when the browser half of a job fails (file read error, upload error,
// start rejected), the page closes the job so it doesn't block new jobs for 3 hours.
// Loads the real route with a mocked database; any unmocked import fails the test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Chainable Supabase stand-in. The UPDATE honours its .in("status", ...) filter like Postgres would. */
function fakeDb(job) {
  const queries = [];
  return {
    queries,
    from(table) {
      const q = { table, args: [], payload: null };
      queries.push(q);
      const answer = () => {
        if (!q.payload) return { data: job, error: null };
        const allowed = q.args.find(([op, c]) => op === "in" && c === "status")?.[2] ?? [];
        return { data: job && allowed.includes(job.status) ? [{ id: job.id }] : [], error: null };
      };
      const chain = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") return (resolve, reject) => Promise.resolve(answer()).then(resolve, reject);
          return (...args) => {
            q.args.push([prop, ...args]);
            if (prop === "update") q.payload = args[0];
            return chain;
          };
        },
      });
      return chain;
    },
  };
}

function loadRoute(db) {
  const relative = "src/app/api/ai-clips/[id]/abandon/route.ts";
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const mocks = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabaseAdmin": { supabaseAdmin: db },
    "@/lib/teamAuth": { getTeamContext: async () => ({ ok: true, ctx: { teamId: "t", userId: "u", role: "owner" } }) },
  };
  const exports = {};
  const context = vm.createContext({
    exports, Request, Response, Promise, Date, JSON, String,
    console: { error() {}, warn() {}, log() {} },
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unmocked import blocked: ${specifier}`);
    },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return exports;
}

const call = (db, body) => loadRoute(db).POST(
  new Request("https://clipdash.test/api/ai-clips/j1/abandon", { method: "POST", body: JSON.stringify(body ?? {}) }),
  { params: { id: "j1" } },
);
const update = (db) => db.queries.find((q) => q.payload);
const job = (over) => ({ id: "j1", user_id: "u", team_id: "t", processing_path: "large", status: "pending", ...over });

test("a pending large-path job is marked failed with the browser's message", async () => {
  const db = fakeDb(job());
  const body = await (await call(db, { error: "Your browser lost access to the video file." })).json();
  assert.deepEqual({ ok: body.ok, abandoned: body.abandoned }, { ok: true, abandoned: true });
  assert.equal(update(db).payload.status, "failed");
  assert.equal(update(db).payload.error, "Your browser lost access to the video file.");
});

test("a large-path job still uploading audio chunks can be abandoned", async () => {
  const body = await (await call(fakeDb(job({ status: "uploading" })))).json();
  assert.equal(body.abandoned, true);
});

test("a job the workflow already owns is left alone", async () => {
  for (const status of ["transcribing", "detecting", "cutting", "done"]) {
    const body = await (await call(fakeDb(job({ status })))).json();
    assert.equal(body.abandoned, false, status);
  }
});

test("a small-path job only counts as browser-owned while pending", async () => {
  assert.equal((await (await call(fakeDb(job({ processing_path: "small" })))).json()).abandoned, true);
  // small-path "uploading" means the workflow was dispatched and is downloading the file
  assert.equal((await (await call(fakeDb(job({ processing_path: "small", status: "uploading" })))).json()).abandoned, false);
});

test("another team's job is a 404 and nothing is written", async () => {
  const db = fakeDb(job({ team_id: "other" }));
  const res = await call(db);
  assert.equal(res.status, 404);
  assert.equal(update(db), undefined);
});

test("missing reason falls back to a default, and long reasons are capped", async () => {
  const db1 = fakeDb(job());
  await call(db1);
  assert.match(update(db1).payload.error, /start it again/);
  const db2 = fakeDb(job());
  await call(db2, { error: "x".repeat(1000) });
  assert.equal(update(db2).payload.error.length, 300);
});
