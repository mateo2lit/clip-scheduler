// Run: node --test scripts/test-ai-clip-results.mjs
// Large-file AI Clips: the browser cuts each moment and attaches the clips to the job, which
// then renders like a small-file job. Subtitles must line up with where each clip really starts.
// The route is loaded as real code with a mocked database; any unmocked import fails the test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clipResults = await import("../src/lib/aiClips/clipResults.ts");
const { clipResultsFromMoments } = clipResults;

const words = [
  { start: 98, end: 99, word: "before" },
  { start: 100.5, end: 101, word: "hello" },
  { start: 101, end: 102, word: "world" },
  { start: 129.5, end: 131, word: "after" },
];
const moment = { start_sec: 100, end_sec: 130, title: "Hello", subtitles_json: words.slice(1, 3) };

test("subtitles are relative to where the clip really starts (its keyframe), not start_sec", () => {
  const { subtitles } = clipResultsFromMoments([moment], [98.5]);
  assert.deepEqual(subtitles[0].map((w) => [w.start, w.end, w.word]), [[2, 2.5, "hello"], [2.5, 3.5, "world"]]);
});

test("titles come from the moments, with a fallback", () => {
  const { titles } = clipResultsFromMoments([moment, { start_sec: 0, end_sec: 10 }], [100, 0]);
  assert.deepEqual(titles, ["Hello", "Clip 2"]);
});

test("a missing clip start falls back to the moment start", () => {
  const { subtitles } = clipResultsFromMoments([moment], [NaN]);
  assert.equal(subtitles[0][0].start, 0.5);
});

// ── Route ───────────────────────────────────────────────────────────────────

function fakeDb(job, ownedIds) {
  const queries = [];
  return {
    queries,
    from(table) {
      const q = { table, args: [], payload: null };
      queries.push(q);
      const answer = () => {
        if (q.payload) return { data: null, error: null };
        if (table === "ai_clip_jobs") return { data: job, error: null };
        if (table === "uploads") return { data: ownedIds.map((id) => ({ id })), error: null };
        return { data: null, error: null };
      };
      const chain = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") return (resolve, reject) => Promise.resolve(answer()).then(resolve, reject);
          return (...args) => { q.args.push([prop, ...args]); if (prop === "update") q.payload = args[0]; return chain; };
        },
      });
      return chain;
    },
  };
}

function loadRoute(db) {
  const relative = "src/app/api/ai-clips/[id]/clips/route.ts";
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const mocks = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabaseAdmin": { supabaseAdmin: db },
    "@/lib/teamAuth": { getTeamContext: async () => ({ ok: true, ctx: { teamId: "t", userId: "u", role: "owner" } }) },
    "@/lib/aiClips/clipResults": clipResults,
  };
  const exports = {};
  const context = vm.createContext({
    exports, Request, Response, Promise, Date, JSON, String, Number, Array, Set,
    console: { error() {}, warn() {}, log() {} },
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unmocked import blocked: ${specifier}`);
    },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return exports;
}

const post = (db, clips) => loadRoute(db).POST(
  new Request("https://clipdash.test/api/ai-clips/j1/clips", { method: "POST", body: JSON.stringify({ clips }) }),
  { params: { id: "j1" } },
);
const largeJob = (over) => ({ id: "j1", team_id: "t", status: "done", processing_path: "large", result_moments_json: [moment], ...over });

test("route: attaches the clips with titles, subtitles and count", async () => {
  const db = fakeDb(largeJob(), ["up1"]);
  const res = await post(db, [{ upload_id: "up1", start_sec: 98.5 }]);
  assert.equal(res.status, 200);
  const written = db.queries.find((q) => q.payload).payload;
  assert.deepEqual(written.result_upload_ids, ["up1"]);
  assert.deepEqual(written.result_titles, ["Hello"]);
  assert.equal(written.result_subtitles[0][0].start, 2);
  assert.equal(written.clips_generated, 1);
});

test("route: refuses an upload that isn't this team's", async () => {
  const db = fakeDb(largeJob(), []);
  const res = await post(db, [{ upload_id: "someone-elses", start_sec: 100 }]);
  assert.equal(res.status, 400);
  assert.ok(!db.queries.some((q) => q.payload), "nothing written");
});

test("route: needs exactly one clip per moment", async () => {
  const res = await post(fakeDb(largeJob(), ["up1", "up2"]), [{ upload_id: "up1", start_sec: 100 }, { upload_id: "up2", start_sec: 0 }]);
  assert.equal(res.status, 400);
});

test("route: small-path or unfinished jobs aren't touched", async () => {
  assert.equal((await post(fakeDb(largeJob({ processing_path: "small" }), ["up1"]), [{ upload_id: "up1", start_sec: 100 }])).status, 409);
  assert.equal((await post(fakeDb(largeJob({ status: "detecting" }), ["up1"]), [{ upload_id: "up1", start_sec: 100 }])).status, 409);
});
