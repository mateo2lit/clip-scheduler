// Run: node --experimental-strip-types --test scripts/test-post-status-changes.mjs
// The Scheduled page's "failed to publish" / "published" notices. Deleting a failed post used
// to pop "1 post failed to publish": a refresh that began before the delete came back with
// the post, which the page had already forgotten, so it looked like a brand-new failure.
import test from "node:test";
import assert from "node:assert/strict";
import { postStatusChanges } from "../src/lib/postStatusChanges.ts";

const m = (obj) => new Map(Object.entries(obj));
const none = new Set();

test("a post that goes from scheduled to failed is reported", () => {
  const out = postStatusChanges(m({ a: "scheduled", b: "posting" }), m({ a: "failed", b: "posting" }), none);
  assert.deepEqual(out, { newlyFailed: ["a"], vanished: [] });
});

test("a post removed here, coming back in a stale refresh, is not a new failure", () => {
  // The page forgot "a" when it was removed; a refresh started before the delete still has it.
  const out = postStatusChanges(m({ b: "scheduled" }), m({ a: "failed", b: "scheduled" }), new Set(["a"]));
  assert.deepEqual(out, { newlyFailed: [], vanished: [] });
});

test("a failed post the page never saw before is not announced", () => {
  const out = postStatusChanges(m({}), m({ a: "failed" }), none);
  assert.deepEqual(out.newlyFailed, []);
});

test("a post that stays failed is not announced again", () => {
  const out = postStatusChanges(m({ a: "failed" }), m({ a: "failed" }), none);
  assert.deepEqual(out.newlyFailed, []);
});

test("posts leaving the list are only candidates for 'published', minus ones removed here", () => {
  const out = postStatusChanges(m({ a: "ig_processing", b: "failed", c: "scheduled" }), m({ c: "scheduled" }), new Set(["b"]));
  assert.deepEqual(out, { newlyFailed: [], vanished: ["a"] });
});
