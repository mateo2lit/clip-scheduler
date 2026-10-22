// Run: node --test scripts/test-retry-summary.mjs
// When every post in a group is done, the worker emails one summary. After a retry, that summary
// used to list all 8 platforms as if they had just been published, when only the retried one
// (e.g. Facebook) went out. These tests prove a retry is told apart from the first run by when
// each post was picked up, and that the email says the retry went through and the rest were
// already live.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { splitByRound } from "../src/lib/groupSummary.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = (hhmm, day = "2026-10-22") => `${day}T${hhmm}:00.000Z`;
const post = (provider, status, claimed, last_error = null) => ({ provider, status, ig_container_created_at: claimed, last_error });

test("first run: every post is this round, nothing earlier", () => {
  const { thisRound, earlier } = splitByRound([
    post("youtube", "posted", at("01:07")),
    post("x", "posted", at("01:07")),
    post("instagram", "posted", at("01:08")),
    post("facebook", "failed", at("01:08"), "facebook not connected"),
  ]);
  assert.deepEqual(thisRound.map((r) => r.platform).sort(), ["facebook", "instagram", "x", "youtube"]);
  assert.deepEqual(earlier, []);
});

test("a busy queue that spreads one run over many minutes is still one round", () => {
  const { earlier } = splitByRound(["01:00", "01:06", "01:12", "01:18", "01:24"].map((t, i) => post(`p${i}`, "posted", at(t))));
  assert.deepEqual(earlier, []);
});

test("retry: only the post picked up after the gap is this round", () => {
  const { thisRound, earlier } = splitByRound([
    post("youtube", "posted", at("01:07")),
    post("tiktok", "posted", at("01:07")),
    post("instagram", "posted", at("01:08")),
    post("facebook", "posted", at("02:15")),
  ]);
  assert.deepEqual(thisRound, [{ platform: "facebook", ok: true, error: undefined }]);
  assert.deepEqual(earlier.map((r) => r.platform).sort(), ["instagram", "tiktok", "youtube"]);
});

test("retry days later, with one platform left failed from the first run", () => {
  const { thisRound, earlier } = splitByRound([
    post("youtube", "posted", at("14:01", "2026-10-12")),
    post("x", "failed", at("14:00", "2026-10-12"), "X rejected the video"),
    post("facebook", "posted", at("02:10")),
  ]);
  assert.deepEqual(thisRound.map((r) => r.platform), ["facebook"]);
  assert.deepEqual(earlier.find((r) => r.platform === "x"), { platform: "x", ok: false, error: "X rejected the video" });
});

test("a post with no pick-up time can't start a retry round; it counts as earlier only when a retry is detected", () => {
  assert.deepEqual(splitByRound([post("youtube", "posted", null), post("x", "posted", at("01:07"))]).earlier, []);
  const retry = splitByRound([post("youtube", "posted", null), post("x", "posted", at("01:07")), post("facebook", "posted", at("03:00"))]);
  assert.deepEqual(retry.thisRound.map((r) => r.platform), ["facebook"]);
  assert.deepEqual(retry.earlier.map((r) => r.platform).sort(), ["x", "youtube"]);
});

/** Loads src/lib/email.ts with Resend replaced by a recorder. */
function loadEmail() {
  const relative = "src/lib/email.ts";
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const sent = [];
  const exports = {};
  const context = vm.createContext({
    exports, Promise,
    process: { env: { RESEND_API_KEY: "re_test", NEXT_PUBLIC_APP_URL: "https://clipdash.test" } },
    console: { error() {}, warn() {}, log() {} },
    require(specifier) {
      if (specifier === "resend") return { Resend: class { emails = { send: async (m) => { sent.push(m); } }; } };
      throw new Error(`Unmocked import blocked: ${specifier}`);
    },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return { email: exports, sent };
}

const sevenLive = ["youtube", "tiktok", "instagram", "x", "bluesky", "linkedin", "pinterest"].map((platform) => ({ platform, ok: true }));

test("retry email says the retry went through and names only what just posted", async () => {
  const { email, sent } = loadEmail();
  await email.sendGroupSummaryEmail("me@example.test", "Use THIS To Post", [{ platform: "facebook", ok: true }], sevenLive);
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.equal(m.subject, "Retry went through: Facebook published");
  assert.match(m.html, /Your retry went through/);
  assert.match(m.text, /Facebook published on retry/);
  assert.match(m.html, /already live/i);
  assert.match(m.html, /YouTube, TikTok, Instagram, X, Bluesky, LinkedIn, Pinterest/);
  assert.doesNotMatch(m.html, /all 8|Published on all/i);
});

test("a retry that fails again says so", async () => {
  const { email, sent } = loadEmail();
  await email.sendGroupSummaryEmail("me@example.test", "Clip", [{ platform: "facebook", ok: false, error: "Page token expired" }], sevenLive);
  assert.equal(sent[0].subject, "Retry failed: Facebook");
  assert.match(sent[0].html, /Page token expired/);
});

test("platforms that failed the first time and weren't retried are called out", async () => {
  const { email, sent } = loadEmail();
  await email.sendGroupSummaryEmail("me@example.test", "Clip", [{ platform: "facebook", ok: true }],
    [{ platform: "youtube", ok: true }, { platform: "x", ok: false, error: "X rejected the video" }]);
  assert.match(sent[0].html, /Still failed from the first try: X/);
});

test("a first-run summary is unchanged", async () => {
  const { email, sent } = loadEmail();
  await email.sendGroupSummaryEmail("me@example.test", "Clip", sevenLive);
  assert.equal(sent[0].subject, "Post summary: all platforms succeeded");
  assert.match(sent[0].html, /Published on all 7 selected platform/);
});
