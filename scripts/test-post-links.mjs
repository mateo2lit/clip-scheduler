// Run: node --test scripts/test-post-links.mjs
// Links from the Posted page to the live post on each platform.
import test from "node:test";
import assert from "node:assert/strict";
import { getPostUrl } from "../src/lib/postLinks.ts";

test("YouTube Shorts open in the Shorts player", () => {
  assert.equal(getPostUrl("youtube", "xWOARo3Oc3Y", { youtubeIsShort: true }), "https://www.youtube.com/shorts/xWOARo3Oc3Y");
});

test("regular YouTube videos keep the watch link", () => {
  assert.equal(getPostUrl("youtube", "abc123", { youtubeIsShort: false }), "https://www.youtube.com/watch?v=abc123");
  assert.equal(getPostUrl("youtube", "abc123"), "https://www.youtube.com/watch?v=abc123");
});

test("other platforms are unchanged", () => {
  assert.equal(getPostUrl("facebook", "123"), "https://www.facebook.com/123");
  assert.equal(getPostUrl("linkedin", "urn:li:share:1"), "https://www.linkedin.com/feed/update/urn:li:share:1");
  assert.equal(getPostUrl("instagram", "https://www.instagram.com/reel/X/"), "https://www.instagram.com/reel/X/");
  assert.equal(getPostUrl("instagram", "1789"), null, "numeric media IDs have no public link");
  assert.equal(getPostUrl("pinterest", "99"), "https://www.pinterest.com/pin/99/");
  assert.equal(getPostUrl("youtube", null), null);
});

test("link-in-bio: YouTube Shorts open in the Shorts player too", async () => {
  const { resolvePostPermalink } = await import("../src/lib/bioHelpers.ts");
  assert.equal(resolvePostPermalink("youtube", "abc", null, { youtubeIsShort: true }), "https://www.youtube.com/shorts/abc");
  assert.equal(resolvePostPermalink("youtube", "abc", null), "https://www.youtube.com/watch?v=abc");
});
