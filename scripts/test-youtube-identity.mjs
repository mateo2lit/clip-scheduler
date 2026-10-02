import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { loadTs, memoryDb } from "./helpers/load-ts.mjs";

const ID = "UC" + "a".repeat(22), OTHER = "UC" + "b".repeat(22);
const identity = loadTs("src/lib/youtubeIdentity.ts");
const channel = (id = ID, snippet = { title: "Current channel", customUrl: "@Current", thumbnails: {} }) => ({ id, snippet });
const api = data => ({ channels: { list: async (params, options) => {
  assert.equal(params.mine, true); assert.equal(options.retry, false); assert.equal(options.timeout, 8000); return { data };
} } });

test("YouTube identity: current channel profile, not an old Brand Account label", async () => {
  const result = await identity.verifyYouTubeIdentity(api({ items: [channel()] }), ID);
  assert.equal(result.channelId, ID); assert.equal(result.title, "Current channel"); assert.equal(result.customUrl, "@Current");
});
for (const [label, data, code] of [
  ["empty", {}, "missing"], ["multiple", { items: [channel(), channel(OTHER)] }, "ambiguous"],
  ["incomplete page", { items: [channel()], nextPageToken: "more" }, "ambiguous"],
  ["malformed ID", { items: [channel("invalid")] }, "missing"],
]) test(`YouTube identity rejects ${label}`, async () => { await assert.rejects(identity.resolveYouTubeIdentity(api(data)), e => e.code === code); });
test("YouTube identity: renaming does not change identity; different ID is blocked", async () => {
  await identity.verifyYouTubeIdentity(api({ items: [channel(ID, { title: "Renamed" })] }), ID);
  await assert.rejects(identity.verifyYouTubeIdentity(api({ items: [channel(OTHER)] }), ID), e => e.code === "mismatch");
});
test("YouTube identity: missing expected ID never queries Google", async () => {
  await assert.rejects(identity.verifyYouTubeIdentity({}, null), e => e.code === "missing");
});
test("YouTube identity: one bounded retry; provider secrets never surface", async () => {
  let calls = 0;
  const broken = { channels: { list: async () => { calls++; throw new Error("Authorization Bearer secret"); } } };
  await assert.rejects(identity.verifyYouTubeIdentity(broken, ID), e => e.code === "unavailable" && !e.message.includes("secret"));
  assert.equal(calls, 2);
});
test("YouTube identity: temporary failure can recover", async () => {
  let calls = 0;
  const flaky = { channels: { list: async () => { if (!calls++) throw new Error("timeout"); return { data: { items: [channel()] } }; } } };
  assert.equal((await identity.verifyYouTubeIdentity(flaky, ID)).channelId, ID);
});
test("YouTube feature flags are off by default and allowlist only the intended team", () => {
  assert.equal(identity.youtubeFeatureEnabled("CONFIRMATION", "team"), false);
  const flagged = loadTs("src/lib/youtubeIdentity.ts", {}, { process: { env: { YOUTUBE_CONFIRMATION_TEAM_IDS: " team,other " } } });
  assert.equal(flagged.youtubeFeatureEnabled("CONFIRMATION", "team"), true);
  assert.equal(flagged.youtubeFeatureEnabled("IDENTITY_ENFORCEMENT", "team"), false);
  assert.equal(flagged.youtubeFeatureEnabled("CONFIRMATION", "outsider"), false);
});

const env = { OAUTH_STATE_SECRET: "test-only", YOUTUBE_CONNECTION_ENCRYPTION_KEY: "ab".repeat(32) };
const crypt = loadTs("src/lib/youtubeConnectionCrypto.ts", { "node:crypto": crypto }, { process: { env } });
test("YouTube attempt signatures reject tampering and wrong versions", () => {
  const id = crypto.randomUUID(), state = crypt.signAttempt(id);
  assert.equal(crypt.verifyAttemptState(state), id);
  for (const bad of [state + "x", state.replace("yt1", "yt2"), state.replace(id, crypto.randomUUID())]) assert.throws(() => crypt.verifyAttemptState(bad));
});
test("Pending credentials are encrypted and bound to one attempt", () => {
  const id = crypto.randomUUID(), token = "private-refresh-token";
  const sealed = crypt.sealCredentials(id, { refreshToken: token });
  assert.ok(!sealed.includes(token)); assert.equal(crypt.openCredentials(id, sealed).refreshToken, token);
  assert.throws(() => crypt.openCredentials(crypto.randomUUID(), sealed));
  const parts = sealed.split("."); parts[1] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => crypt.openCredentials(id, parts.join(".")));
});

function uploader(actual = ID) {
  const db = memoryDb(); const uploads = []; const fetches = [];
  db.storage = { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://storage.test/file" }, error: null }) }) };
  const youtube = { ...api({ items: [channel(actual)] }), videos: { insert: async args => { uploads.push(args); return { data: { id: "video-1" } }; } },
    thumbnails: { set: async () => { throw new Error("Thumbnail failed"); } }, playlistItems: { insert: async () => { throw new Error("Playlist failed"); } } };
  const lib = loadTs("src/lib/youtubeUpload.ts", { "node:stream": { Readable }, "./supabaseAdmin": { supabaseAdmin: db },
    "./youtubeIdentity": identity, "./youtube": { getYouTubeOAuthClient: async () => ({}), getYouTubeApi: () => youtube, readOAuthTokens: () => ({}) } },
    { fetch: async url => { fetches.push(url); return new Response("video"); } });
  return { lib, uploads, fetches };
}
const args = { userId: "user", platformAccountId: "account", refreshToken: "refresh", bucket: "clips", storagePath: "clip.mp4", title: "Title", privacyStatus: "private", verifyChannelIdentity: true, expectedChannelId: ID };
test("Upload mismatch blocks media download and upload", async () => {
  const u = uploader(OTHER); await assert.rejects(u.lib.uploadSupabaseVideoToYouTube(args));
  assert.equal(u.fetches.length, 0); assert.equal(u.uploads.length, 0);
});
test("Verified upload preserves options; thumbnail/playlist failure never reuploads", async () => {
  const u = uploader(); const result = await u.lib.uploadSupabaseVideoToYouTube({ ...args, description: "Description", categoryId: "20", madeForKids: true, embeddable: false,
    notifySubscribers: false, publicStatsViewable: false, extraSnippet: { tags: ["test"], defaultLanguage: "en" }, extraStatus: { containsSyntheticMedia: true }, thumbnailPath: "thumb.jpg", playlistId: "playlist" });
  assert.equal(result.youtubeVideoId, "video-1"); assert.equal(u.uploads.length, 1);
  const upload = u.uploads[0]; assert.equal(upload.notifySubscribers, false);
  assert.deepEqual(JSON.parse(JSON.stringify(upload.requestBody)), { snippet: { title: "Title", description: "Description", categoryId: "20", tags: ["test"], defaultLanguage: "en" }, status: { privacyStatus: "private", selfDeclaredMadeForKids: true, embeddable: false, publicStatsViewable: false, containsSyntheticMedia: true } });
});
test("Upload with enforcement disabled preserves legacy behavior", async () => {
  const u = uploader(OTHER); await u.lib.uploadSupabaseVideoToYouTube({ ...args, verifyChannelIdentity: false }); assert.equal(u.uploads.length, 1);
});
