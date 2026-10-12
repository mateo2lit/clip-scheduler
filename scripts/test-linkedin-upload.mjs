// Run: node --test scripts/test-linkedin-upload.mjs
// LinkedIn video uploads read the file part by part from a stream instead of loading it
// whole (a large video loaded whole got worker runs killed for memory). Loads the real
// uploader with mocked storage and network; any unmocked import fails the test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function load(fetchImpl) {
  const relative = "src/lib/linkedinUpload.ts";
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const exports = {};
  const context = vm.createContext({
    exports, Response, Headers, ReadableStream, Uint8Array, Buffer, Promise, JSON, Number, Math, Error, Object, Array, String,
    console: { error() {}, warn() {}, log() {} },
    fetch: (...args) => fetchImpl(...args),
    require(specifier) {
      if (specifier === "./supabaseAdmin") {
        return { supabaseAdmin: { storage: { from: () => ({ createSignedUrl: async (p) => ({ data: { signedUrl: `https://storage.test/${p}` } }) }) } } };
      }
      throw new Error(`Unmocked import blocked: ${specifier}`);
    },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 5000 });
  return exports;
}

/** A storage response that hands the file over in small, uneven network chunks. */
function streamedFile(bytes, chunkSize = 1000) {
  let offset = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
  return new Response(body, { headers: { "content-length": String(bytes.byteLength) } });
}

function fakeLinkedIn(fileBytes, partSize) {
  const parts = [];
  const calls = [];
  const instructions = [];
  for (let first = 0; first < fileBytes.byteLength; first += partSize) {
    const last = Math.min(first + partSize, fileBytes.byteLength) - 1;
    instructions.push({ uploadUrl: `https://upload.test/part${instructions.length}`, firstByte: first, lastByte: last });
  }
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith("https://storage.test/")) return streamedFile(fileBytes);
    if (String(url).includes("action=initializeUpload")) {
      // Hand the parts back out of order: the uploader must sort them.
      return Response.json({ value: { video: "urn:li:video:1", uploadToken: "tok", uploadInstructions: [...instructions].reverse() } });
    }
    if (String(url).startsWith("https://upload.test/")) {
      parts.push({ url: String(url), body: new Uint8Array(init.body) });
      return new Response(null, { status: 200, headers: { etag: `"etag-${parts.length}"` } });
    }
    if (String(url).includes("action=finalizeUpload")) return new Response(null, { status: 200 });
    if (String(url) === "https://api.linkedin.com/rest/posts") {
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:9" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { impl, parts, calls };
}

const args = {
  userId: "u", platformAccountId: "a", accessToken: "t", personUrn: "urn:li:person:p",
  bucket: "clips", storagePath: "team/v.mp4", title: "Clip",
};

test("each part gets exactly its bytes, read from the stream, in order", async () => {
  const fileBytes = new Uint8Array(10_500).map((_, i) => i % 253);
  const net = fakeLinkedIn(fileBytes, 4096);
  const li = load(net.impl);
  const out = await li.uploadSupabaseVideoToLinkedIn(args);
  assert.equal(out.linkedinPostId, "urn:li:share:9");

  assert.deepEqual(net.parts.map((p) => p.url), ["https://upload.test/part0", "https://upload.test/part1", "https://upload.test/part2"]);
  assert.deepEqual(net.parts.map((p) => p.body.byteLength), [4096, 4096, 2308]);
  const joined = new Uint8Array(fileBytes.byteLength);
  let at = 0;
  for (const p of net.parts) { joined.set(p.body, at); at += p.body.byteLength; }
  assert.deepEqual(joined, fileBytes);

  const init = JSON.parse(net.calls.find((c) => c.url.includes("initializeUpload")).init.body);
  assert.equal(init.initializeUploadRequest.fileSizeBytes, fileBytes.byteLength);
  const finalize = JSON.parse(net.calls.find((c) => c.url.includes("finalizeUpload")).init.body);
  assert.deepEqual(finalize.finalizeUploadRequest.uploadedPartIds, ["etag-1", "etag-2", "etag-3"]);
});

test("visibility, resharing and alt text reach the post", async () => {
  const net = fakeLinkedIn(new Uint8Array(100), 4096);
  const li = load(net.impl);
  await li.uploadSupabaseVideoToLinkedIn({ ...args, visibility: "LOGGED_IN", isReshareDisabledByAuthor: true, altText: "A demo" });
  const post = JSON.parse(net.calls.find((c) => c.url === "https://api.linkedin.com/rest/posts").init.body);
  assert.equal(post.visibility, "LOGGED_IN");
  assert.equal(post.isReshareDisabledByAuthor, true);
  assert.equal(post.content.media.altText, "A demo");
});

test("a video shorter than its declared size fails clearly instead of uploading garbage", async () => {
  const net = fakeLinkedIn(new Uint8Array(5000), 4096);
  const realImpl = net.impl;
  const li = load(async (url, init) => {
    if (String(url).startsWith("https://storage.test/")) {
      // Claims 5000 bytes but only delivers 4500
      const res = streamedFile(new Uint8Array(4500));
      return new Response(res.body, { headers: { "content-length": "5000" } });
    }
    return realImpl(url, init);
  });
  await assert.rejects(li.uploadSupabaseVideoToLinkedIn(args), /Video ended early/);
  assert.ok(!net.calls.some((c) => c.url.includes("finalizeUpload")), "an incomplete video is never finalized");
});

test("a missing file size is an error, not a zero-byte upload", async () => {
  const li = load(async (url) => {
    if (String(url).startsWith("https://storage.test/")) return new Response(new ReadableStream({ start(c) { c.close(); } }));
    throw new Error(`Unexpected request: ${url}`);
  });
  await assert.rejects(li.uploadSupabaseVideoToLinkedIn(args), /Failed to fetch video from storage/);
});
