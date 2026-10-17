// Run: node --test scripts/test-cloud-import.mjs
// Google Drive / Dropbox import: request parsing, provider checks, size limits, and the rule
// that the download credential never reaches the (public) GitHub workflow inputs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CLOUD_IMPORT_MAX_BYTES,
  cloudDispatchInputs,
  cloudImportSizeError,
  isDropboxDirectLink,
  isVideoFile,
  parseCloudImportRequest,
  secretFor,
  titleFromFileName,
  verifyCloudFile,
} from "../src/lib/cloudImport.ts";

const GB = 1024 * 1024 * 1024;
const DROPBOX_LINK = "https://dl.dropboxusercontent.com/1/view/abc123/clip.mp4";

function fakeFetch(status, { json = {}, headers = {} } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
      headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    };
  };
  impl.calls = calls;
  return impl;
}

test("only Dropbox content links are accepted, so the worker can't be pointed anywhere else", () => {
  assert.equal(isDropboxDirectLink(DROPBOX_LINK), true);
  assert.equal(isDropboxDirectLink("https://uc123.dl.dropboxusercontent.com/cd/0/get/x"), true);
  assert.equal(isDropboxDirectLink("http://dl.dropboxusercontent.com/1/view/x"), false, "https only");
  assert.equal(isDropboxDirectLink("https://evil.com/?dropboxusercontent.com"), false);
  assert.equal(isDropboxDirectLink("https://dropboxusercontent.com.evil.com/x"), false);
  assert.equal(isDropboxDirectLink("https://169.254.169.254/latest/meta-data"), false);
  assert.equal(isDropboxDirectLink("not a url"), false);
});

test("parses each source and rejects bad input", () => {
  const drive = parseCloudImportRequest({ source: "gdrive", fileId: "1AbC_dEf-123456", accessToken: "ya29.x" });
  assert.equal(drive.ok, true);
  assert.equal(parseCloudImportRequest({ source: "gdrive", fileId: "../etc", accessToken: "t" }).ok, false);
  assert.equal(parseCloudImportRequest({ source: "gdrive", fileId: "1AbC_dEf-123456" }).ok, false);

  const dbx = parseCloudImportRequest({ source: "dropbox", link: DROPBOX_LINK, name: "clip.mp4", bytes: 1000 });
  assert.equal(dbx.ok, true);
  assert.equal(parseCloudImportRequest({ source: "dropbox", link: "https://example.com/a.mp4", name: "a.mp4" }).ok, false);
  assert.equal(parseCloudImportRequest({ source: "youtube" }).ok, false);
  assert.equal(parseCloudImportRequest(null).ok, false);
});

test("the workflow gets the job id only, never the token or link", () => {
  const inputs = cloudDispatchInputs("job-1");
  assert.deepEqual(inputs, { job_id: "job-1" });
  const req = { source: "gdrive", fileId: "1AbC_dEf-123456", accessToken: "ya29.secret" };
  assert.ok(!JSON.stringify(inputs).includes(secretFor(req)));
  assert.equal(secretFor({ source: "dropbox", link: DROPBOX_LINK, name: "a.mp4", bytes: 1 }), DROPBOX_LINK);
});

test("size checks: unknown size, over 2 GB, and over the plan's storage", () => {
  assert.match(cloudImportSizeError(0, 0, 25 * GB), /size/);
  assert.match(cloudImportSizeError(CLOUD_IMPORT_MAX_BYTES + 1, 0, 25 * GB), /2 GB/);
  assert.match(cloudImportSizeError(1 * GB, 24.5 * GB, 25 * GB), /Storage limit reached \(25 GB\)/);
  assert.equal(cloudImportSizeError(1 * GB, 10 * GB, 25 * GB), null);
  assert.equal(cloudImportSizeError(CLOUD_IMPORT_MAX_BYTES, 0, 25 * GB), null, "exactly 2 GB is allowed");
});

test("video detection and titles from file names", () => {
  assert.equal(isVideoFile("a.MOV"), true);
  assert.equal(isVideoFile("notes.pdf"), false);
  assert.equal(isVideoFile("no-extension", "video/mp4"), true);
  assert.equal(isVideoFile("photo.jpg", "image/jpeg"), false);
  assert.equal(titleFromFileName("My Clip_final.mp4"), "My Clip_final");
  assert.equal(titleFromFileName(".mp4"), "Imported video");
});

test("Drive: uses the real size and name from Google, with the user's token", async () => {
  const f = fakeFetch(200, { json: { id: "1AbC_dEf-123456", name: "stream.mp4", mimeType: "video/mp4", size: "524288000" } });
  const r = await verifyCloudFile({ source: "gdrive", fileId: "1AbC_dEf-123456", accessToken: "ya29.x" }, f);
  assert.deepEqual(r, { ok: true, value: { name: "stream.mp4", size: 524288000, fileId: "1AbC_dEf-123456" } });
  assert.match(f.calls[0].url, /drive\/v3\/files\/1AbC_dEf-123456\?.*supportsAllDrives=true/);
  assert.equal(f.calls[0].init.headers.Authorization, "Bearer ya29.x");
});

test("Drive: expired token, unopenable file, and non-video files are refused", async () => {
  const req = { source: "gdrive", fileId: "1AbC_dEf-123456", accessToken: "t" };
  assert.match((await verifyCloudFile(req, fakeFetch(401))).error, /expired/);
  assert.match((await verifyCloudFile(req, fakeFetch(404))).error, /can't open/);
  const pdf = fakeFetch(200, { json: { name: "doc.pdf", mimeType: "application/pdf", size: "10" } });
  assert.match((await verifyCloudFile(req, pdf)).error, /isn't a video/);
});

test("Dropbox: HEAD size wins over the browser's; falls back when HEAD fails; expired link is refused", async () => {
  const req = { source: "dropbox", link: DROPBOX_LINK, name: "clip.mp4", bytes: 100 };
  const head = await verifyCloudFile(req, fakeFetch(200, { headers: { "content-length": "999" } }));
  assert.equal(head.value.size, 999);

  const broken = async () => { throw new Error("network"); };
  assert.equal((await verifyCloudFile(req, broken)).value.size, 100);

  assert.match((await verifyCloudFile(req, fakeFetch(404))).error, /expired/);
  assert.match((await verifyCloudFile({ ...req, name: "a.zip" }, fakeFetch(200))).error, /isn't a video/);
});
