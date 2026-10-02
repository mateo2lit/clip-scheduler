// Run: node --test scripts/test-wait-copy.mjs
// Every AI Clips wait explains what is happening, why it takes time, and roughly how long.
import test from "node:test";
import assert from "node:assert/strict";
import * as w from "../src/app/ai-clips/waitCopy.ts";

test("formatAbout rounds to friendly units", () => {
  assert.equal(w.formatAbout(8), "about 10 sec");
  assert.equal(w.formatAbout(44), "about 45 sec");
  assert.equal(w.formatAbout(95), "about 2 min");
  assert.equal(w.formatAbout(600), "about 10 min");
});

test("every generation stage has a title and a why, and no bare 'Processing'", () => {
  for (const s of ["pending", "uploading", "transcribing", "detecting", "cutting"]) {
    assert.ok(w.GENERATION_COPY[s].title && w.GENERATION_COPY[s].why.length > 20, s);
    assert.doesNotMatch(w.GENERATION_COPY[s].title + w.GENERATION_COPY[s].why, /^Processing/);
  }
});

test("generation estimates scale with video length and clip count (measured 2026-10-01)", () => {
  assert.equal(w.generationEstimateSec("transcribing", 7, 5), 10 + 5 * 7);
  assert.equal(w.generationEstimateSec("cutting", 7, 5), 40 * 5);
});

test("renderLabel shows a real percent and an ETA once rendering", () => {
  const l = w.renderLabel({ stage: "rendering", pct: 50, elapsedSec: 30 });
  assert.match(l.headline, /Adding captions · Rendering 50% · about 30 sec left/);
  assert.equal(l.slow, false);
});

test("renderLabel before rendering names the stage without a number", () => {
  const l = w.renderLabel({ stage: "preparing", pct: null, elapsedSec: 5 });
  assert.doesNotMatch(l.headline, /\d+%/);
  assert.match(l.headline, /Adding captions/);
});

test("renderLabel flags slow renders past twice the ~60 s estimate", () => {
  const l = w.renderLabel({ stage: "rendering", pct: 20, elapsedSec: 130 });
  assert.equal(l.slow, true);
  assert.match(l.detail, /Taking longer than usual/);
});

test("renderBarPct maps real stages onto one bar (shared by the clip card and the scheduling banner)", () => {
  assert.equal(w.renderBarPct(null, null), 3);
  assert.equal(w.renderBarPct("preparing", null), 8);
  assert.equal(w.renderBarPct("rendering", 0), 10);
  assert.equal(w.renderBarPct("rendering", 100), 95);
  assert.equal(w.renderBarPct("uploading", 100), 97);
});
