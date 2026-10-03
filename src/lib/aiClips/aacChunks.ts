/**
 * Turns an MP4 AAC track's sample table into ADTS chunks, reading only the
 * audio bytes from the file.
 *
 * Deliberately import-free so it can be unit-tested standalone
 * (scripts/test-aac-chunks.mjs).
 */

/** The fields of an mp4box sample this module needs. */
export type AacSample = { offset: number; size: number; dts: number; duration: number; timescale: number };

export type AdtsConfig = { profile: number; freqIndex: number; channelConfig: number };

export type AacChunk = { index: number; startSec: number; endSec: number; parts: Uint8Array<ArrayBuffer>[] };

/** Contiguous audio runs closer than this are read together, to keep the number of reads down. */
const MAX_READ_GAP = 1024 * 1024;
/** Upper bound on one read, so memory stays flat however large the file is. */
const MAX_READ_BYTES = 8 * 1024 * 1024;

/**
 * Parses the start of an AudioSpecificConfig into the fields an ADTS header needs.
 * Returns null for layouts ADTS can't describe (explicit sample rate, channel
 * config 0 / PCE), so the caller can fall back to a real decoder.
 */
export function parseAudioSpecificConfig(asc: Uint8Array): AdtsConfig | null {
  if (asc.length < 2) return null;
  let objectType = asc[0] >> 3;
  const freqIndex = ((asc[0] & 0x07) << 1) | (asc[1] >> 7);
  const channelConfig = (asc[1] >> 3) & 0x0f;
  if (objectType === 31 || freqIndex >= 13 || channelConfig === 0 || channelConfig > 7) return null;
  // HE-AAC (5) and HE-AACv2 (29) carry an AAC-LC core at this sample rate; ADTS signals the core.
  if (objectType === 5 || objectType === 29) objectType = 2;
  if (objectType < 1 || objectType > 4) return null;
  return { profile: objectType - 1, freqIndex, channelConfig };
}

/** 7-byte ADTS header (no CRC) for one raw AAC frame of `frameSize` bytes. */
export function adtsHeader(cfg: AdtsConfig, frameSize: number): Uint8Array<ArrayBuffer> {
  const len = frameSize + 7;
  const h = new Uint8Array(7);
  h[0] = 0xff;
  h[1] = 0xf1;
  h[2] = (cfg.profile << 6) | (cfg.freqIndex << 2) | (cfg.channelConfig >> 2);
  h[3] = ((cfg.channelConfig & 0x03) << 6) | (len >> 11);
  h[4] = (len >> 3) & 0xff;
  h[5] = ((len & 0x07) << 5) | 0x1f;
  h[6] = 0xfc;
  return h;
}

/** Groups samples (in file order) into byte ranges to read, each holding whole samples. */
export function planReads(samples: AacSample[]): { start: number; end: number; first: number; last: number }[] {
  const reads: { start: number; end: number; first: number; last: number }[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const cur = reads[reads.length - 1];
    if (cur && s.offset >= cur.end && s.offset - cur.end <= MAX_READ_GAP && s.offset + s.size - cur.start <= MAX_READ_BYTES) {
      cur.end = s.offset + s.size;
      cur.last = i;
    } else {
      reads.push({ start: s.offset, end: s.offset + s.size, first: i, last: i });
    }
  }
  return reads;
}

/**
 * Yields ~chunkSeconds-long ADTS chunks. Reads happen lazily as chunks are
 * consumed, so a slow consumer (the upload) applies backpressure to file reads.
 */
export async function* aacChunksFromSamples(
  samples: AacSample[],
  cfg: AdtsConfig,
  readRange: (start: number, end: number) => Promise<Uint8Array>,
  chunkSeconds: number,
): AsyncGenerator<AacChunk> {
  let index = 0;
  let parts: Uint8Array<ArrayBuffer>[] = [];
  let startSec = 0;
  let endSec = 0;

  for (const read of planReads(samples)) {
    const bytes = await readRange(read.start, read.end);
    for (let i = read.first; i <= read.last; i++) {
      const s = samples[i];
      const sampleStart = s.dts / s.timescale;
      if (parts.length && sampleStart - startSec >= chunkSeconds) {
        yield { index: index++, startSec, endSec, parts };
        parts = [];
        startSec = sampleStart;
      }
      if (!parts.length) startSec = sampleStart;
      const at = s.offset - read.start;
      parts.push(adtsHeader(cfg, s.size), bytes.slice(at, at + s.size) as Uint8Array<ArrayBuffer>);
      endSec = (s.dts + s.duration) / s.timescale;
    }
  }
  if (parts.length) yield { index, startSec, endSec, parts };
}
