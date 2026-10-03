// src/lib/aiClips/audioExtractor.ts
// MP4/MOV path. FFmpeg.wasm fallback lives in ffmpegFallback.ts.
//
// Reads only the audio frames, by byte range, using the sample table in moov.
// It does not stream the file through mp4box: mp4box frees a buffer only once
// every byte in it was extracted, and with only the audio track extracted the
// video bytes never count, so it kept the whole file (1.4 GB+) in tab memory and
// Chrome failed the read with NotReadableError. AAC frames are sent as ADTS
// (a 7-byte header per frame), which ffmpeg/Whisper read natively, so nothing
// is decoded or re-encoded in the browser.

import { createFile, MP4BoxBuffer, type Movie } from "mp4box";
import type { AudioChunkMeta } from "@/types/aiClipsLarge";
import { aacChunksFromSamples, parseAudioSpecificConfig, type AacSample } from "@/lib/aiClips/aacChunks";

export type ExtractedChunk = AudioChunkMeta & { blob: Blob };

export type ExtractOptions = {
  chunkSeconds?: number;       // default 30
  onProgress?: (sec: number, totalSec: number) => void;
};

const DEFAULT_CHUNK_SECONDS = 30;

/**
 * Async generator: extracts audio from `file` and yields ExtractedChunk objects,
 * each an ADTS AAC blob covering ~chunkSeconds of audio.
 *
 * MP4/MOV with AAC audio is handled here. Any other audio codec is handed to the
 * FFmpeg.wasm fallback.
 */
export async function* extractAudioChunks(
  file: Blob,
  opts: ExtractOptions = {}
): AsyncGenerator<ExtractedChunk> {
  const chunkSeconds = opts.chunkSeconds ?? DEFAULT_CHUNK_SECONDS;

  const mp4 = createFile();
  // Head + tail is enough to parse moov for faststart and non-faststart files alike.
  const info = await primeMp4WithMoov(file, mp4);

  const audioTrack = info.tracks.find((t) => t.type === "audio");
  if (!audioTrack) throw new Error("No audio track in source file.");

  const trak: any = mp4.getTrackById(audioTrack.id);
  const samples: AacSample[] | undefined = trak?.samples;
  const asc = findAudioSpecificConfig(trak);
  const adts = asc ? parseAudioSpecificConfig(asc) : null;

  if (!audioTrack.codec?.startsWith("mp4a.40") || !adts || !samples?.length) {
    const { extractAudioChunksFfmpeg } = await import("@/lib/aiClips/ffmpegFallback");
    yield* extractAudioChunksFfmpeg(file as File, opts);
    return;
  }

  const totalDurationSec = (info.duration / info.timescale) || 0;
  const readRange = async (start: number, end: number) =>
    new Uint8Array(await file.slice(start, end).arrayBuffer());

  for await (const chunk of aacChunksFromSamples(samples, adts, readRange, chunkSeconds)) {
    opts.onProgress?.(chunk.endSec, totalDurationSec);
    yield { index: chunk.index, startSec: chunk.startSec, endSec: chunk.endSec, blob: new Blob(chunk.parts, { type: "audio/aac" }) };
  }
}

/** The DecoderSpecificInfo (tag 5) inside the sample entry's esds is the AudioSpecificConfig. */
function findAudioSpecificConfig(trak: any): Uint8Array | null {
  const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  const find = (d: any): Uint8Array | null => {
    if (!d) return null;
    if (d.tag === 5 && d.data?.length) return new Uint8Array(d.data);
    for (const c of d.descs ?? []) {
      const r = find(c);
      if (r) return r;
    }
    return null;
  };
  return find(entry?.esds?.esd);
}

const PROBE_HEAD_SIZE = 5 * 1024 * 1024;   // 5 MB
const PROBE_TAIL_SIZE = 10 * 1024 * 1024;  // 10 MB
const PROBE_TIMEOUT_MS = 15_000;

/**
 * Probe a video's duration by parsing only the moov atom. Tries the head first
 * (works for faststart MP4s — moov near start). If that doesn't reveal moov within
 * the timeout, tries head+tail (works for non-faststart MP4s — moov at end, typical
 * of OBS recordings, screen recorders, and Twitch VOD downloads).
 *
 * Hard 15s timeout per attempt prevents hangs on broken / unparseable files.
 */
export async function probeMp4DurationSeconds(file: File): Promise<number> {
  // Attempt 1: head only — fast for faststart MP4s
  try {
    return await probeFromRanges(file, [
      { start: 0, end: Math.min(file.size, PROBE_HEAD_SIZE) },
    ]);
  } catch {
    // Attempt 2: head + tail — works for non-faststart MP4s
    if (file.size <= PROBE_HEAD_SIZE) {
      throw new Error("Could not parse MP4 metadata from this file");
    }
    const tailStart = Math.max(PROBE_HEAD_SIZE, file.size - PROBE_TAIL_SIZE);
    return probeFromRanges(file, [
      { start: 0, end: PROBE_HEAD_SIZE },
      { start: tailStart, end: file.size },
    ]);
  }
}

async function probeFromRanges(
  file: File,
  ranges: { start: number; end: number }[],
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const mp4 = createFile();
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error("mp4box probe timeout"))),
      PROBE_TIMEOUT_MS,
    );

    mp4.onError = (e: unknown) => finish(() => reject(new Error(`mp4box error: ${e}`)));
    mp4.onReady = (info: Movie) => finish(() => resolve(info.duration / info.timescale));

    void (async () => {
      try {
        for (const { start, end } of ranges) {
          if (settled) return;
          const ab = await file.slice(start, end).arrayBuffer();
          if (settled) return;
          const buf = MP4BoxBuffer.fromArrayBuffer(ab, start);
          mp4.appendBuffer(buf);
        }
        if (!settled) mp4.flush();
      } catch (e) {
        finish(() => reject(e));
      }
    })();
  });
}

/**
 * Prime an mp4box instance with the head + tail of a file so it has moov parsed
 * before we start streaming the body. Required for non-faststart MP4s (moov at end).
 * Returns the parsed Movie info.
 */
export async function primeMp4WithMoov(
  file: Blob,
  mp4: ReturnType<typeof createFile>,
): Promise<Movie> {
  return new Promise<Movie>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Could not find moov atom in head or tail of file"));
    }, 30_000);

    mp4.onReady = (info: Movie) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(info);
    };
    mp4.onError = (e: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`mp4box error: ${e}`));
    };

    void (async () => {
      try {
        // Always feed head first
        const headEnd = Math.min(file.size, PROBE_HEAD_SIZE);
        const headBuf = await file.slice(0, headEnd).arrayBuffer();
        if (settled) return;
        mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(headBuf, 0));

        // If onReady didn't fire from head alone (faststart case), give it a tick
        // then also feed the tail (non-faststart case).
        await new Promise((r) => setTimeout(r, 50));
        if (settled) return;

        if (file.size > PROBE_HEAD_SIZE) {
          const tailStart = Math.max(PROBE_HEAD_SIZE, file.size - PROBE_TAIL_SIZE);
          const tailBuf = await file.slice(tailStart, file.size).arrayBuffer();
          if (settled) return;
          mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(tailBuf, tailStart));
        }
      } catch (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      }
    })();
  });
}
