// Run: node --test scripts/test-platform-uploads.mjs
// Pinterest video Pins: loads the real uploader with mocked storage and
// network (any unmocked import fails the test). No credentials or live requests.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function load(relative, mocks, fetchImpl) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const exports = {};
  const context = vm.createContext({
    exports, Request, Response, Headers, URLSearchParams, ReadableStream, TextEncoder, FormData, Blob, Buffer,
    Promise, Date, JSON, String, Number, Math, Object, Array, Error, Uint8Array,
    console: { error() {}, warn() {}, log() {} },
    setTimeout: (fn) => { fn(); return 0; }, // the Pinterest status poll waits 5 s between checks
    fetch: (...args) => fetchImpl(...args),
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      throw new Error(`Unmocked import blocked: ${specifier}`);
    },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 5000 });
  return exports;
}

const storage = {
  supabaseAdmin: {
    storage: {
      from: () => ({
        createSignedUrl: async (p) => ({ data: { signedUrl: `https://storage.test/${p}` } }),
        download: async () => ({ data: new Blob([new Uint8Array([1])]) }),
      }),
    },
  },
};

/** Records every request and answers from `routes` (first matching prefix wins). */
function fakeNetwork(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    for (const [prefix, answer] of routes) {
      if (String(url).startsWith(prefix)) return answer(call);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { calls, impl };
}

// ── Pinterest ────────────────────────────────────────────────────────────────

const pinterestMocks = () => ({
  "./supabaseAdmin": storage,
  "./postOptions": { PINTEREST_DESCRIPTION_MAX: 800 },
});

test("the multipart upload streams and declares the exact length", async () => {
  const pin = load("src/lib/pinterestUpload.ts", pinterestMocks(), async () => { throw new Error("no network"); });
  const fileBytes = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 251));
  const file = new Response(fileBytes).body;
  const form = pin.streamingMultipart({ key: "uploads/abc", policy: "p0l1cy" }, file, fileBytes.byteLength, "BOUNDARY");
  const sent = new Uint8Array(await new Response(form.body).arrayBuffer());
  assert.equal(sent.byteLength, form.contentLength);
  // A standard multipart parser must read it back intact.
  const parsed = await new Response(sent, { headers: { "content-type": form.contentType } }).formData();
  assert.equal(parsed.get("key"), "uploads/abc");
  assert.equal(parsed.get("policy"), "p0l1cy");
  assert.deepEqual(new Uint8Array(await parsed.get("file").arrayBuffer()), fileBytes);
  // Policy fields must come before the file for S3.
  const text = new TextDecoder().decode(sent);
  assert.ok(text.indexOf('name="policy"') < text.indexOf('name="file"'));
});

function pinterestNetwork(fileBytes) {
  return fakeNetwork([
    ["https://api.pinterest.com/v5/media/", () => Response.json({ status: "succeeded" })],
    ["https://api.pinterest.com/v5/media", () => Response.json({
      media_id: "777", upload_url: "https://s3.test/upload", upload_parameters: { key: "k", policy: "p" },
    })],
    ["https://storage.test/", () => new Response(fileBytes, { headers: { "content-length": String(fileBytes.byteLength) } })],
    ["https://s3.test/upload", async (c) => {
      c.uploaded = new Uint8Array(await new Response(c.init.body).arrayBuffer());
      return new Response(null, { status: 204 });
    }],
    ["https://api.pinterest.com/v5/pins", () => Response.json({ id: "pin42" })],
  ]);
}

test("a video Pin is created with every option and the video is streamed", async () => {
  const fileBytes = new Uint8Array(4096).fill(7);
  const net = pinterestNetwork(fileBytes);
  const pin = load("src/lib/pinterestUpload.ts", pinterestMocks(), net.impl);
  const out = await pin.uploadToPinterest({
    accessToken: "tok", bucket: "clips", storagePath: "team/v.mp4", title: "T".repeat(150),
    description: "d".repeat(900), boardId: "1",
    extras: {
      link: "https://clipdash.org", alt_text: "alt", board_section_id: "55",
      ai_disclosures: { values: ["AI_MODIFIED"] }, cover_image_key_frame_time: 3,
    },
    coverImageUrl: "https://storage.test/thumb.jpg",
  });
  assert.equal(out.platform_post_id, "pin42");

  const upload = net.calls.find((c) => c.url === "https://s3.test/upload");
  assert.ok(upload.init.body instanceof ReadableStream, "the video is streamed, not buffered");
  assert.equal(Number(upload.init.headers["Content-Length"]), upload.uploaded.byteLength);

  const body = JSON.parse(net.calls.find((c) => c.url === "https://api.pinterest.com/v5/pins").init.body);
  assert.equal(body.title.length, 100);
  assert.equal(body.description.length, 800);
  assert.equal(body.board_section_id, "55");
  assert.deepEqual(body.ai_disclosures, { values: ["AI_MODIFIED"] });
  assert.equal(body.link, "https://clipdash.org");
  assert.equal(body.alt_text, "alt");
  // The cover image wins over a cover frame, and the frame is never sent at the top level.
  assert.deepEqual(body.media_source, { source_type: "video_id", media_id: "777", cover_image_url: "https://storage.test/thumb.jpg" });
  assert.ok(!Object.hasOwn(body, "cover_image_key_frame_time"));
});

test("without a cover image the chosen frame is used; with neither, Pinterest picks", async () => {
  for (const [extras, expected] of [
    [{ cover_image_key_frame_time: 4 }, { source_type: "video_id", media_id: "777", cover_image_key_frame_time: 4 }],
    [{}, { source_type: "video_id", media_id: "777" }],
  ]) {
    const net = pinterestNetwork(new Uint8Array(10));
    const pin = load("src/lib/pinterestUpload.ts", pinterestMocks(), net.impl);
    await pin.uploadToPinterest({ accessToken: "t", bucket: "b", storagePath: "v.mp4", title: "T", boardId: "1", extras });
    const body = JSON.parse(net.calls.find((c) => c.url === "https://api.pinterest.com/v5/pins").init.body);
    assert.deepEqual(body.media_source, expected);
  }
});
