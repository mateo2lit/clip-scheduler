// Run: node --experimental-strip-types --test scripts/test-post-templates.mjs
// Upload templates save each platform's settings, except TikTok's (TikTok requires them to be
// chosen on every post), and save the title only when the user asks.
import test from "node:test";
import assert from "node:assert/strict";
import { buildTemplate, parseTemplates, templateTitle } from "../src/lib/postTemplates.ts";

const allSettings = {
  youtube: {
    isShort: true, category: "science", visibility: "public", notifySubscribers: false, allowEmbedding: true,
    madeForKids: false, publicStats: true, tags: "tech, review", language: "es-419", license: "youtube", playlistId: "PL1",
  },
  instagram: { igType: "reel", firstComment: "Link in bio", collaborators: "@pal", shareToFeed: false },
  linkedin: { visibility: "CONNECTIONS" },
  x: { replySettings: "mentionedUsers" },
  bluesky: { language: "en", replyGate: "following" },
  pinterest: { boardId: "b1", link: "https://example.com" },
  // The page never passes TikTok settings, but if anything did they must not be saved.
  tiktok: { privacy_level: "PUBLIC_TO_EVERYONE", allow_comments: true, allow_duet: true },
};

const input = (over) => ({
  id: "t1", name: "Shorts", includeTitle: false, title: "My video title", description: "Desc", hashtags: ["a", "b"],
  platforms: ["youtube", "tiktok", "instagram", "x"],
  titleOverrides: { youtube: "YT title", tiktok: "" },
  descriptionOverrides: { youtube: "YT desc", tiktok: "TT caption", linkedin: "not selected" },
  settings: allSettings,
  ...over,
});

test("the selected platforms' settings are saved, so YouTube category, visibility and language come back", () => {
  const t = buildTemplate(input());
  assert.equal(t.version, 2);
  assert.deepEqual(t.settings.youtube, allSettings.youtube);
  assert.deepEqual(t.settings.instagram, allSettings.instagram);
  assert.deepEqual(t.settings.x, allSettings.x);
});

test("TikTok settings are never saved, even when TikTok is selected", () => {
  const t = buildTemplate(input());
  assert.ok(t.platforms.includes("tiktok"), "TikTok stays a selected platform");
  assert.ok(!Object.hasOwn(t.settings, "tiktok"));
  assert.doesNotMatch(JSON.stringify(t), /privacy_level|allow_duet/);
});

test("platforms that weren't selected don't get settings", () => {
  const t = buildTemplate(input());
  assert.deepEqual(Object.keys(t.settings).sort(), ["instagram", "x", "youtube"]);
  assert.ok(!Object.hasOwn(t.descriptionOverrides, "linkedin"));
});

test("without 'Include title' no title is saved and loading leaves the title alone", () => {
  const t = buildTemplate(input());
  assert.equal(t.title, "");
  assert.deepEqual(t.titleOverrides, {});
  assert.equal(templateTitle(t), null);
});

test("with 'Include title' the title and title overrides are saved", () => {
  const t = buildTemplate(input({ includeTitle: true }));
  assert.equal(t.title, "My video title");
  assert.deepEqual(t.titleOverrides, { youtube: "YT title" });
  assert.equal(templateTitle(t), "My video title");
});

test("including an empty title still leaves the current title alone", () => {
  const t = buildTemplate(input({ includeTitle: true, title: "   " }));
  assert.equal(templateTitle(t), null);
});

test("description overrides are saved, including TikTok's editable caption", () => {
  const t = buildTemplate(input());
  assert.deepEqual(t.descriptionOverrides, { youtube: "YT desc", tiktok: "TT caption" });
});

test("templates saved before this change never apply their title", () => {
  // The old page saved whatever was in the title box — the bug that overwrote titles.
  const [legacy] = parseTemplates(JSON.stringify([
    { id: "old", name: "Old", title: "Last week's video", description: "d", hashtags: ["x"], platforms: ["youtube"] },
  ]));
  assert.equal(templateTitle(legacy), null);
  assert.equal(legacy.description, "d");
  assert.deepEqual(legacy.platforms, ["youtube"]);
  assert.equal(legacy.settings, undefined);
});

test("saved templates survive a round trip through localStorage", () => {
  const t = buildTemplate(input({ includeTitle: true }));
  const [back] = parseTemplates(JSON.stringify([t]));
  assert.deepEqual(back, t);
});

test("TikTok settings smuggled into storage are stripped on load", () => {
  const [t] = parseTemplates(JSON.stringify([
    { id: "x", name: "X", version: 2, title: "", description: "", hashtags: [], platforms: ["tiktok"], settings: { tiktok: { privacy_level: "SELF_ONLY" }, x: { replySettings: "everyone" } } },
  ]));
  assert.deepEqual(Object.keys(t.settings), ["x"]);
});

test("malformed storage doesn't break the page", () => {
  assert.deepEqual(parseTemplates(null), []);
  assert.deepEqual(parseTemplates("not json"), []);
  assert.deepEqual(parseTemplates(JSON.stringify({ a: 1 })), []);
  assert.deepEqual(parseTemplates(JSON.stringify([null, 3, { name: "no id" }])), []);
});

test("wrongly typed or unknown fields are dropped on load, so the form never gets undefined", () => {
  const [t] = parseTemplates(JSON.stringify([{
    id: "w", name: "W", version: 2, title: "", description: "", hashtags: [], platforms: ["youtube", "x"],
    settings: {
      youtube: { tags: 5, language: "fr", visibility: "everyone", isShort: "yes", madeForKids: false, extra: "?" },
      x: { replySettings: "friends" },
      snapchat: { anything: true },
    },
  }]));
  assert.deepEqual(t.settings, { youtube: { madeForKids: false, language: "fr" } });
});
