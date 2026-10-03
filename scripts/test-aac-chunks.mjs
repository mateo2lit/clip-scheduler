// Run: node --test scripts/test-aac-chunks.mjs
// Large-file AI Clips: audio is read from the MP4 by byte range (never the whole file) and
// sent as ADTS AAC chunks that ffmpeg/Whisper can decode.
import test from "node:test";
import assert from "node:assert/strict";

const { parseAudioSpecificConfig, adtsHeader, planReads, aacChunksFromSamples } = await import("../src/lib/aiClips/aacChunks.ts");

const LC_44100_STEREO = { profile: 1, freqIndex: 4, channelConfig: 2 };

test("AudioSpecificConfig: AAC-LC 44.1 kHz stereo (what YouTube Studio exports)", () => {
  assert.deepEqual(parseAudioSpecificConfig(Uint8Array.from([0x12, 0x10])), LC_44100_STEREO);
});

test("AudioSpecificConfig: HE-AAC is signalled as its AAC-LC core", () => {
  // objectType 5, freqIndex 6 (24 kHz core), stereo
  assert.deepEqual(parseAudioSpecificConfig(Uint8Array.from([0x2b, 0x10])), { profile: 1, freqIndex: 6, channelConfig: 2 });
});

test("AudioSpecificConfig: layouts ADTS can't express return null (falls back to ffmpeg)", () => {
  assert.equal(parseAudioSpecificConfig(Uint8Array.from([0x12, 0x00])), null, "channel config 0 = PCE");
  assert.equal(parseAudioSpecificConfig(Uint8Array.from([0x17, 0x90])), null, "explicit sample rate");
  assert.equal(parseAudioSpecificConfig(Uint8Array.from([0x12])), null, "truncated");
});

test("ADTS header matches the spec layout", () => {
  // 0xFFF1 sync/MPEG-4/no CRC; LC, 44.1 kHz, stereo; frame length 477 + 7 = 484; buffer fullness 0x7FF
  assert.deepEqual([...adtsHeader(LC_44100_STEREO, 477)], [0xff, 0xf1, 0x50, 0x80, 0x3c, 0x9f, 0xfc]);
});

const sample = (offset, size, i) => ({ offset, size, dts: i * 1024, duration: 1024, timescale: 44100 });

test("reads: nearby audio runs are merged, distant ones and oversized reads are split", () => {
  const samples = [sample(100, 10, 0), sample(110, 10, 1), sample(500_000, 10, 2), sample(5_000_000, 10, 3)];
  const reads = planReads(samples);
  assert.deepEqual(reads.map((r) => [r.first, r.last]), [[0, 2], [3, 3]]);
  // A 9 MB stretch can't be one read (8 MB cap)
  assert.equal(planReads([sample(0, 10, 0), sample(9_000_000, 10, 1)]).length, 2);
});

test("chunks: split on the time boundary, carry timestamps, and contain header+frame bytes from the file", async () => {
  // 100 frames of 1024 samples at 44.1 kHz ≈ 2.32 s; 1-second chunks -> 3 chunks
  const file = new Uint8Array(100 * 50).map((_, i) => i % 251);
  const samples = Array.from({ length: 100 }, (_, i) => sample(i * 50, 50, i));
  const reads = [];
  const readRange = async (s, e) => { reads.push([s, e]); return file.slice(s, e); };

  const chunks = [];
  for await (const c of aacChunksFromSamples(samples, LC_44100_STEREO, readRange, 1)) chunks.push(c);

  assert.deepEqual(chunks.map((c) => c.index), [0, 1, 2]);
  assert.equal(chunks[0].startSec, 0);
  assert.equal(chunks[1].startSec, chunks[0].endSec, "chunks are back to back");
  assert.ok(Math.abs(chunks[2].endSec - (100 * 1024) / 44100) < 1e-9, "last chunk ends at the last frame");
  assert.equal(chunks.reduce((n, c) => n + c.parts.length, 0), 200, "a header and a frame per sample");
  assert.deepEqual([...chunks[0].parts[1]], [...file.slice(0, 50)], "frame bytes come from the sample's offset");
  assert.deepEqual([...chunks[2].parts.at(-1)], [...file.slice(99 * 50, 100 * 50)]);
  assert.equal(reads.length, 1, "contiguous audio is read in one go");
});

test("chunks: reads are lazy, so a paused consumer stops file reads", async () => {
  const samples = Array.from({ length: 200 }, (_, i) => sample(i * 2_000_000, 10, i)); // every frame far apart
  let reads = 0;
  const gen = aacChunksFromSamples(samples, LC_44100_STEREO, async (s, e) => { reads++; return new Uint8Array(e - s); }, 1);
  await gen.next();
  assert.ok(reads < 60, `only enough reads for the first chunk (${reads})`);
});
