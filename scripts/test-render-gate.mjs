// Run: node --test scripts/test-render-gate.mjs
// renderGate decides whether a scheduled post's video can be published yet (AI Clips reserves
// the captioned upload before its render finishes).
import test from "node:test";
import assert from "node:assert/strict";
import { renderGate, RENDER_TIMEOUT_MS } from "../src/lib/renderGate.ts";

const now = Date.parse("2026-10-02T12:00:00Z");
const ago = (ms) => new Date(now - ms).toISOString();

test("uploads without render columns are ready (legacy and normal uploads)", () => {
  assert.equal(renderGate(null, now), "ready");
  assert.equal(renderGate({}, now), "ready");
  assert.equal(renderGate({ render_status: null }, now), "ready");
});

test("a render in progress waits", () => {
  assert.equal(renderGate({ render_status: "rendering", render_started_at: ago(60_000) }, now), "wait");
});

test("a failed render fails the post", () => {
  assert.equal(renderGate({ render_status: "failed", render_started_at: ago(60_000) }, now), "fail");
});

test("a render older than the timeout fails; just under it still waits", () => {
  assert.equal(renderGate({ render_status: "rendering", render_started_at: ago(RENDER_TIMEOUT_MS + 1) }, now), "fail");
  assert.equal(renderGate({ render_status: "rendering", render_started_at: ago(RENDER_TIMEOUT_MS - 1000) }, now), "wait");
});

test("rendering with no start time waits rather than failing instantly", () => {
  assert.equal(renderGate({ render_status: "rendering", render_started_at: null }, now), "wait");
});
