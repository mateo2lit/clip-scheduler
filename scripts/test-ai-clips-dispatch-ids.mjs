// Run: node --test scripts/test-ai-clips-dispatch-ids.mjs
// The repo is public, so workflow_dispatch inputs are public. AI Clips must dispatch IDs only: the
// pasted link and the user's moment prompt are stored on the job row and read there by the runner.
// Loads the real routes with a mocked database and network; unmocked imports and calls fail.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_IN = "https://www.twitch.tv/videos/123456789";
const PROMPT = "the part where my cat knocks the mic over";

/** Chainable Supabase stand-in: records every query and answers from `responses[table](query)`. */
function fakeDb(responses) {
  const queries = [];
  return {
    queries,
    storage: { from: () => ({ list: async () => ({ data: [{ name: "x" }], error: null }) }) },
    from(table) {
      const q = { table, ops: [], payload: null };
      queries.push(q);
      const chain = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") {
            return (resolve) => resolve(responses[table]?.(q) ?? { data: null, error: null });
          }
          return (...args) => {
            q.ops.push(prop);
            if (prop === "insert" || prop === "update") q.payload = args[0];
            return chain;
          };
        },
      });
      return chain;
    },
  };
}

function load(relative, db) {
  const dispatches = [];
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const mocks = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabaseAdmin": { supabaseAdmin: db },
    "@/lib/teamAuth": { getTeamContext: async () => ({ ok: true, ctx: { teamId: "team-1", userId: "user-1" } }) },
    "@/lib/aiClipJobs": { reapStaleAiClipJobs: async () => {} },
  };
  const exports = {};
  const context = vm.createContext({
    exports, URL, Request, Response, Headers, Promise, JSON, Date, crypto,
    process: { env: { GITHUB_PAT: "pat", GITHUB_REPO: "owner/repo" } },
    console: { error() {}, warn() {}, log() {} },
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unmocked import blocked: ${specifier}`);
    },
    async fetch(url, options) {
      if (!String(url).includes("/actions/workflows/ai-clips.yml/dispatches")) {
        throw new Error(`Unmocked network call blocked: ${url}`);
      }
      dispatches.push(options.body);
      return new Response(null, { status: 204 });
    },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return { exports, dispatches };
}

function assertIdsOnly(body) {
  assert.ok(!body.includes(URL_IN) && !body.includes("twitch"), `dispatch carries the link: ${body}`);
  assert.ok(!body.includes(PROMPT), `dispatch carries the prompt: ${body}`);
  const { inputs } = JSON.parse(body);
  assert.deepEqual(Object.keys(inputs).sort(), ["job_id", "team_id", "user_id"]);
  assert.equal(inputs.team_id, "team-1");
  assert.equal(inputs.user_id, "user-1");
  return inputs;
}

test("prepare-url stores the link and prompt on the job row and dispatches IDs only", async () => {
  const db = fakeDb({
    teams: () => ({ data: { plan: "team", plan_status: "active" }, error: null }),
    ai_clip_jobs: () => ({ data: [], error: null }),
  });
  const route = load("src/app/api/ai-clips/prepare-url/route.ts", db);
  const res = await route.exports.POST(new Request("https://clipdash.test/api/ai-clips/prepare-url", {
    method: "POST",
    body: JSON.stringify({ source_url: URL_IN, moment_prompt: PROMPT, clip_count: 4, genre: "gaming" }),
  }));
  const out = await res.json();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(route.dispatches.length, 1);
  const inputs = assertIdsOnly(route.dispatches[0]);
  assert.equal(inputs.job_id, out.jobId);
  // The runner reads these from the row, so the row must have them
  const insert = db.queries.find((q) => q.table === "ai_clip_jobs" && q.ops.includes("insert"));
  assert.equal(insert.payload.id, out.jobId);
  assert.equal(insert.payload.source_url, URL_IN);
  assert.equal(insert.payload.moment_prompt, PROMPT);
  assert.equal(insert.payload.clip_count, 4);
  assert.equal(insert.payload.genre, "gaming");
});

test("start dispatches IDs only for a link job", async () => {
  const db = fakeDb({
    ai_clip_jobs: () => ({
      data: { id: "job-1", team_id: "team-1", status: "pending", source_url: URL_IN, source_file_path: "",
        source_bucket: "clips", moment_prompt: PROMPT },
      error: null,
    }),
  });
  const route = load("src/app/api/ai-clips/[id]/start/route.ts", db);
  const res = await route.exports.POST(new Request("https://clipdash.test/api/ai-clips/job-1/start", { method: "POST" }),
    { params: { id: "job-1" } });
  assert.equal((await res.json()).ok, true);
  assert.equal(assertIdsOnly(route.dispatches[0]).job_id, "job-1");
});

test("start dispatches IDs only for an uploaded file", async () => {
  const db = fakeDb({
    ai_clip_jobs: () => ({
      data: { id: "job-2", team_id: "team-1", status: "pending", source_url: null,
        source_file_path: "team-1/ai_source_job-2.mp4", source_bucket: "clips" },
      error: null,
    }),
  });
  const route = load("src/app/api/ai-clips/[id]/start/route.ts", db);
  const res = await route.exports.POST(new Request("https://clipdash.test/api/ai-clips/job-2/start", { method: "POST" }),
    { params: { id: "job-2" } });
  assert.equal((await res.json()).ok, true);
  assert.equal(assertIdsOnly(route.dispatches[0]).job_id, "job-2");
});
