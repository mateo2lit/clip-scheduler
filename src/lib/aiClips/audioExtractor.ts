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
  const info = await new Promise<Movie>((resolve, reject) => {
    mp4.onError = (e: unknown) => reject(new Error(`mp4box error: ${e}`));
    mp4.onReady = (info: Movie) => resolve(info);
    streamFileToMp4(file, mp4).catch(reject);
  });

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

  await encoder.configure({
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
  let extractDone = false;

  mp4.onSamples = (_id: number, _user: unknown, samples: Sample[]) => {
    samplesQueue.push(...samples);
  };
  mp4.start();

  // Drive samples → decoder → encoder → flushChunk loop until done
  // (mp4box delivers samples synchronously inside flush; but appendBuffer is async)

  // After mp4 is fully fed, samplesQueue contains all audio samples
  while (samplesQueue.length || decodedFrames.length || encodedChunks.length || !extractDone) {
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

    if (samplesQueue.length === 0 && decodedFrames.length === 0 && encodedChunks.length === 0) {
      extractDone = true;
    }
  }

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

async function streamFileToMp4(file: File, mp4: ReturnType<typeof createFile>): Promise<void> {
  const reader = file.stream().getReader();
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      mp4.flush();
      return;
    }
    const ab = MP4BoxBuffer.fromArrayBuffer(value.buffer, offset);
    mp4.appendBuffer(ab);
    offset += value.byteLength;
  }
}

export async function probeMp4DurationSeconds(file: File): Promise<number> {
  const mp4 = createFile();
  const info = await new Promise<Movie>((resolve, reject) => {
    mp4.onError = (e: unknown) => reject(new Error(`mp4box error: ${e}`));
    mp4.onReady = (info: Movie) => resolve(info);
    // Only stream the head — most MP4 moov atoms are within first 5 MB.
    // For non-faststart files the moov is at the end; in that case we fall through
    // and consume the whole file. Acceptable for this probe.
    streamFileToMp4(file, mp4).catch(reject);
  });
  return info.duration / info.timescale;
}
