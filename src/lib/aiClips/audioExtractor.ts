// src/lib/aiClips/audioExtractor.ts
// MP4 path only. FFmpeg.wasm fallback lives in ffmpegFallback.ts.
//
// NOTE: The plan's import used non-existent type aliases (MP4ArrayBuffer, MP4Info, MP4Sample).
// mp4box@0.5.x exports the actual types as: MP4BoxBuffer, Movie, Sample, Track, createFile.
// There is no default export — createFile is a named export.

import { createFile, MP4BoxBuffer, type Movie, type Sample, type Track } from "mp4box";
import type { AudioChunkMeta } from "@/types/aiClipsLarge";

export type ExtractedChunk = AudioChunkMeta & { blob: Blob };

export type ExtractOptions = {
  chunkSeconds?: number;       // default 30
  onProgress?: (sec: number, totalSec: number) => void;
};

const DEFAULT_CHUNK_SECONDS = 30;
const TARGET_SAMPLE_RATE = 16000;
const TARGET_CHANNELS = 1;
const TARGET_BITRATE = 24000;

/**
 * Async generator: extracts audio from `file` and yields ExtractedChunk objects
 * each containing a single Opus-encoded blob covering ~chunkSeconds of audio.
 *
 * Container limitation: MP4/MOV only. Use ffmpegFallback for other containers.
 */
export async function* extractAudioChunks(
  file: File,
  opts: ExtractOptions = {}
): AsyncGenerator<ExtractedChunk> {
  const chunkSeconds = opts.chunkSeconds ?? DEFAULT_CHUNK_SECONDS;

  const mp4 = createFile();
  // Prime mp4box with head+tail so moov is parsed BEFORE we start streaming the body.
  // This works for both faststart MP4s (moov at start) and non-faststart MP4s
  // (moov at end — typical of OBS/screen recordings). Without this, mp4box can
  // get lost inside multi-GB mdat boxes and never find moov.
  const info = await primeMp4WithMoov(file, mp4);

  const audioTrack: Track | undefined = info.tracks.find((t) => t.type === "audio");
  if (!audioTrack) throw new Error("No audio track in source file.");

  const totalDurationSec = (info.duration / info.timescale) || 0;

  // Set up WebCodecs AudioDecoder to turn track samples into PCM frames.
  const decodedFrames: AudioData[] = [];
  let decoderError: Error | null = null;

  const decoder = new AudioDecoder({
    output: (frame) => decodedFrames.push(frame),
    error: (e) => { decoderError = e instanceof Error ? e : new Error(String(e)); },
  });

  // Decoder config: pulled from track
  const codec = audioTrack.codec || "mp4a.40.2";  // AAC LC default
  decoder.configure({
    codec,
    sampleRate: audioTrack.audio?.sample_rate ?? 48000,
    numberOfChannels: audioTrack.audio?.channel_count ?? 2,
  });

  // Set up WebCodecs AudioEncoder for Opus output
  const encodedChunks: { data: Uint8Array<ArrayBuffer>; timestamp: number; duration: number }[] = [];
  let encoderError: Error | null = null;

  const encoder = new AudioEncoder({
    output: (chunk, _meta) => {
      const buf = new Uint8Array(chunk.byteLength) as Uint8Array<ArrayBuffer>;
      chunk.copyTo(buf);
      encodedChunks.push({ data: buf, timestamp: chunk.timestamp, duration: chunk.duration ?? 0 });
    },
    error: (e) => { encoderError = e instanceof Error ? e : new Error(String(e)); },
  });

  encoder.configure({
    codec: "opus",
    sampleRate: TARGET_SAMPLE_RATE,
    numberOfChannels: TARGET_CHANNELS,
    bitrate: TARGET_BITRATE,
  });

  // Walk track samples, feed decoder, then on each decoded frame feed encoder
  // (resampling/downmix done by the encoder via WebCodecs).
  mp4.setExtractionOptions(audioTrack.id, null, { nbSamples: 100 });

  let chunkIndex = 0;
  let chunkStartSec = 0;
  let pendingDurationSec = 0;
  let chunkBlobParts: Uint8Array<ArrayBuffer>[] = [];

  const flushChunk = (): ExtractedChunk | null => {
    if (chunkBlobParts.length === 0) return null;
    const blob = new Blob(chunkBlobParts, { type: "audio/ogg; codecs=opus" });
    const out: ExtractedChunk = {
      index: chunkIndex,
      startSec: chunkStartSec,
      endSec: chunkStartSec + pendingDurationSec,
      blob,
    };
    chunkIndex++;
    chunkStartSec = out.endSec;
    pendingDurationSec = 0;
    chunkBlobParts = [] as Uint8Array<ArrayBuffer>[];
    return out;
  };

  const samplesQueue: Sample[] = [];
  let streamingDone = false;

  mp4.onSamples = (_id: number, _user: unknown, samples: Sample[]) => {
    samplesQueue.push(...samples);
  };

  // Stream just the BODY (between head and tail) since the head + tail are already
  // in mp4box's buffer from primeMp4WithMoov. mp4box uses the moov info (already
  // parsed) to extract audio samples as their bytes arrive in the body.
  const bodyStart = Math.min(file.size, PROBE_HEAD_SIZE);
  const bodyEnd = Math.max(bodyStart, file.size - PROBE_TAIL_SIZE);
  const streamPromise = streamFileToMp4(file, mp4, undefined, bodyStart, bodyEnd).then(() => {
    streamingDone = true;
  });

  mp4.start();

  // Drive samples → decoder → encoder → flushChunk loop until done.
  // Exit only when the stream is fully drained AND all queues are empty.
  // Without the streamingDone guard, the loop can exit early on large files
  // when the producer hasn't fed any samples yet (all queues momentarily empty).
  while (!streamingDone || samplesQueue.length || decodedFrames.length || encodedChunks.length) {
    if (decoderError) throw decoderError;
    if (encoderError) throw encoderError;

    // Feed decoder from sample queue
    while (samplesQueue.length) {
      const s = samplesQueue.shift()!;
      decoder.decode(new EncodedAudioChunk({
        type: s.is_sync ? "key" : "delta",
        timestamp: (s.cts / s.timescale) * 1_000_000,
        duration: (s.duration / s.timescale) * 1_000_000,
        data: s.data!,
      }));
    }
    if (decoder.decodeQueueSize > 0) {
      await decoder.flush().catch(() => undefined);
    }

    // Feed encoder from decoded frames
    while (decodedFrames.length) {
      const frame = decodedFrames.shift()!;
      encoder.encode(frame);
      frame.close();
    }
    if (encoder.encodeQueueSize > 0) {
      await encoder.flush().catch(() => undefined);
    }

    // Drain encoded chunks into the in-progress audio chunk
    while (encodedChunks.length) {
      const ec = encodedChunks.shift()!;
      chunkBlobParts.push(ec.data);
      pendingDurationSec += (ec.duration || 20_000) / 1_000_000;  // µs → s
      if (pendingDurationSec >= chunkSeconds) {
        const out = flushChunk();
        if (out) {
          opts.onProgress?.(out.endSec, totalDurationSec);
          yield out;
        }
      }
    }

    // If stream isn't done yet and all queues are empty, yield to the event loop
    // so the streaming promise can make progress before we spin again.
    if (!streamingDone && samplesQueue.length === 0 && decodedFrames.length === 0 && encodedChunks.length === 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  // Ensure the stream completed without error.
  await streamPromise;

  // Final flush
  await encoder.flush();
  while (encodedChunks.length) {
    const ec = encodedChunks.shift()!;
    chunkBlobParts.push(ec.data);
    pendingDurationSec += (ec.duration || 20_000) / 1_000_000;
  }
  const tail = flushChunk();
  if (tail) {
    opts.onProgress?.(tail.endSec, totalDurationSec);
    yield tail;
  }

  encoder.close();
  decoder.close();
}

async function streamFileToMp4(
  file: File,
  mp4: ReturnType<typeof createFile>,
  signal?: AbortSignal,
  rangeStart?: number,
  rangeEnd?: number,
): Promise<void> {
  // If range bounds provided, stream only that slice; otherwise stream the whole file.
  const start = rangeStart ?? 0;
  const end = rangeEnd ?? file.size;
  if (start >= end) {
    mp4.flush();
    return;
  }
  const slice = (start === 0 && end === file.size) ? file : file.slice(start, end);
  const reader = slice.stream().getReader();
  let offset = start;
  try {
    while (true) {
      if (signal?.aborted) {
        const err = new DOMException("Aborted", "AbortError");
        reader.cancel(err);
        throw err;
      }
      const { done, value } = await reader.read();
      if (done) {
        mp4.flush();
        return;
      }
      // Slice the underlying ArrayBuffer to exactly the chunk's bytes — value.buffer
      // may be larger than value.byteLength if it's a view. mp4box uses the buffer's
      // full byteLength to determine how much data was provided, so passing a view
      // would feed garbage past the actual chunk content.
      const chunkAb = value.byteOffset === 0 && value.byteLength === value.buffer.byteLength
        ? value.buffer
        : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      const ab = MP4BoxBuffer.fromArrayBuffer(chunkAb, offset);
      mp4.appendBuffer(ab);
      offset += value.byteLength;
    }
  } catch (e) {
    reader.cancel(e);
    throw e;
  }
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
async function primeMp4WithMoov(
  file: File,
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
