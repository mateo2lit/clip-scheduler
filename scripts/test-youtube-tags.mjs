// Run: node --experimental-strip-types --test scripts/test-youtube-tags.mjs
// Exercises the real settings parser and uploader with mocked storage and YouTube.
// No credentials, network requests, or live uploads are used.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { Readable } from "node:stream";
import ts from "typescript";
import { youtubeExtras } from "../src/lib/postOptions.ts";
import { resolvePlatformSettings } from "../src/lib/scheduledPostSettings.ts";

function loadUploader() {
  const requests = [];
  const source = fs.readFileSync(new URL("../src/lib/youtubeUpload.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mocks = {
    "node:stream": { Readable },
    "./youtube": {
      getYouTubeOAuthClient: async () => ({}),
      readOAuthTokens: () => ({}),
      getYouTubeApi: () => ({
        videos: {
          insert: async (request) => {
            requests.push(request);
            return { data: { id: "test-video-id" } };
          },
        },
      }),
    },
    "./supabaseAdmin": {
      supabaseAdmin: {
        storage: {
          from: () => ({
            createSignedUrl: async () => ({ data: { signedUrl: "https://storage.example.invalid/video.mp4" } }),
          }),
        },
      },
    },
  };
  const exports = {};
  const context = vm.createContext({
    exports, console,
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unexpected import: ${specifier}`);
    },
    fetch: async (url) => {
      assert.equal(url, "https://storage.example.invalid/video.mp4");
      return new Response(new Uint8Array([0, 1, 2]));
    },
  });
  new vm.Script(compiled).runInContext(context);
  return { upload: exports.uploadSupabaseVideoToYouTube, requests };
}

async function captureUpload(settings) {
  // The create endpoint persists this entire settings blob; the worker uses
  // youtubeExtras to pass its snippet/status fields to the uploader.
  const persisted = resolvePlatformSettings("youtube", { youtube_settings: settings });
  assert.equal(persisted.column, "youtube_settings");
  const extras = youtubeExtras(persisted.value);
  const { upload, requests } = loadUploader();
  const result = await upload({
    userId: "test-user", platformAccountId: "test-account", refreshToken: "mock-token",
    bucket: "clips", storagePath: "video.mp4", title: "Test video",
    description: "Description with #gaming #shorts", privacyStatus: "private",
    categoryId: "20", extraSnippet: extras.snippet, extraStatus: extras.status,
    extraParts: extras.extraParts,
  });
  assert.equal(result.youtubeVideoId, "test-video-id");
  assert.equal(requests.length, 1);
  return requests[0];
}

for (const is_short of [true, false]) {
  test(`${is_short ? "Short" : "regular video"}: keyword tags reach videos.insert unchanged`, async () => {
    const request = await captureUpload({ is_short, tags: "#gaming, warzone highlights, Gaming,, " });
    assert.deepEqual(request.requestBody.snippet.tags, ["gaming", "warzone highlights"]);
    assert.equal(request.requestBody.snippet.description, "Description with #gaming #shorts");
    assert.deepEqual(Array.from(request.part), ["snippet", "status"]);
    assert.equal(request.requestBody.status.privacyStatus, "private");
  });
}

test("Short: array tags survive settings persistence and upload", async () => {
  const request = await captureUpload({ is_short: true, tags: ["gaming", "multi word tag"] });
  assert.deepEqual(request.requestBody.snippet.tags, ["gaming", "multi word tag"]);
});

test("Short: blank tags are omitted instead of sending an invalid empty tag", async () => {
  for (const tags of [undefined, "", " , , ", []]) {
    const request = await captureUpload({ is_short: true, tags });
    assert.ok(!Object.hasOwn(request.requestBody.snippet, "tags"));
  }
});

test("Short: 500-character limit includes commas and quotes around multiword tags", async () => {
  const atLimit = await captureUpload({ is_short: true, tags: ["a".repeat(494), "x y"] });
  assert.deepEqual(atLimit.requestBody.snippet.tags, ["a".repeat(494), "x y"]);
  const overLimit = await captureUpload({ is_short: true, tags: ["a".repeat(495), "x y"] });
  assert.deepEqual(overLimit.requestBody.snippet.tags, ["a".repeat(495)]);
});

test("Short: an oversized first tag is omitted", async () => {
  const request = await captureUpload({ is_short: true, tags: "a".repeat(501) });
  assert.ok(!Object.hasOwn(request.requestBody.snippet, "tags"));
});

test("paid promotion adds its part and flag to videos.insert", async () => {
  const request = await captureUpload({ is_short: true, has_paid_product_placement: true });
  assert.deepEqual(Array.from(request.part), ["snippet", "status", "paidProductPlacementDetails"]);
  assert.deepEqual(request.requestBody.paidProductPlacementDetails, { hasPaidProductPlacement: true });
});

test("recording date and translations become their own parts", async () => {
  const request = await captureUpload({
    is_short: false, default_language: "en", recording_date: "2026-09-30",
    localizations: [{ language: "es", title: "Hola", description: "" }],
  });
  assert.deepEqual(Array.from(request.part), ["snippet", "status", "recordingDetails", "localizations"]);
  assert.deepEqual(request.requestBody.recordingDetails, { recordingDate: "2026-09-30T00:00:00.000Z" });
  assert.deepEqual(request.requestBody.localizations, { es: { title: "Hola", description: "" } });
  assert.equal(request.requestBody.snippet.defaultLanguage, "en");
});

test("without paid promotion the request is unchanged", async () => {
  const request = await captureUpload({ is_short: false });
  assert.deepEqual(Array.from(request.part), ["snippet", "status"]);
  assert.ok(!Object.hasOwn(request.requestBody, "paidProductPlacementDetails"));
});
