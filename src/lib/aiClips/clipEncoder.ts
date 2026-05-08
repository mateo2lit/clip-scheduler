// src/lib/aiClips/clipEncoder.ts
// WebCodecs lazy clip encoder — cuts a frame-accurate clip from the original file,
// decodes via VideoDecoder, re-encodes to H.264 via VideoEncoder, and muxes with mp4-muxer.
//
// NOTE: The plan's import used non-existent aliases (MP4ArrayBuffer, MP4Info, MP4Sample).
// mp4box@1.5.x named exports are: createFile, MP4BoxBuffer, DataStream, Movie, Sample, Track.
// There is no default export — use named imports only.

import {
  createFile,
  MP4BoxBuffer,
  DataStream,
  Endianness,
  type Movie,
  type Sample,
  type Track,
} from "mp4box";

export type EncodeClipOptions = {
  startSec: number;
  endSec: number;
  bitrate?: number;       // default 8 Mbps
  width?: number;         // default: source width
  height?: number;        // default: source height
  framerate?: number;     // default: 30
  onProgress?: (frameIdx: number, totalFrames: number) => void;
};

const DEFAULT_BITRATE = 8_000_000;

/**
 * Encode a single clip as MP4/H.264. Frame-accurate at the start by seeking to the
 * keyframe before startSec and dropping pre-roll frames whose timestamp < desiredStartUs.
 *
 * MP4-only. For other containers, route via FFmpeg.wasm.
 */
export async function encodeClip(file: File, opts: EncodeClipOptions): Promise<Blob> {
  const { startSec, endSec } = opts;
  const targetBitrate = opts.bitrate ?? DEFAULT_BITRATE;

  // Demux source to find video track + sample positions
  const mp4 = createFile();
  const info = await new Promise<Movie>((resolve, reject) => {
    mp4.onError = (e: unknown) => reject(new Error(`mp4box error: ${e}`));
    mp4.onReady = (info: Movie) => resolve(info);
    streamFileToMp4(file, mp4).catch(reject);
  });

  const videoTrack: Track | undefined = info.tracks.find((t) => t.type === "video");
  if (!videoTrack) throw new Error("No video track in source.");

  const width = opts.width ?? videoTrack.video?.width ?? 1920;
  const height = opts.height ?? videoTrack.video?.height ?? 1080;
  const framerate = opts.framerate ?? 30;

  // Pull samples that intersect [startSec, endSec]
  const desiredStartUs = startSec * 1_000_000;
  const desiredEndUs = endSec * 1_000_000;

  // Set up VideoDecoder
  const decodedFrames: VideoFrame[] = [];
  let decoderError: Error | null = null;
  const decoder = new VideoDecoder({
    output: (f) => decodedFrames.push(f),
    error: (e) => { decoderError = e instanceof Error ? e : new Error(String(e)); },
  });
  decoder.configure({
    codec: videoTrack.codec || "avc1.42E01E",
    codedWidth: videoTrack.video?.width ?? width,
    codedHeight: videoTrack.video?.height ?? height,
    description: extractAvcConfig(mp4, videoTrack.id),
  });

  // Set up VideoEncoder
  const encodedChunks: { data: Uint8Array; timestamp: number; duration: number; type: "key" | "delta" }[] = [];
  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      encodedChunks.push({
        data: buf,
        timestamp: chunk.timestamp,
        duration: chunk.duration ?? 0,
        type: chunk.type as "key" | "delta",
      });
    },
    error: (e) => { encoderError = e instanceof Error ? e : new Error(String(e)); },
  });
  await encoder.configure({
    codec: "avc1.42E01E",
    width,
    height,
    bitrate: targetBitrate,
    framerate,
  });

  // Walk samples: back to nearest keyframe before startSec, decode through endSec
  mp4.setExtractionOptions(videoTrack.id, null, { nbSamples: 60 });

  const samplesQueue: Sample[] = [];
  mp4.onSamples = (_id: number, _user: unknown, batch: Sample[]) => {
    samplesQueue.push(...batch);
  };
  mp4.start();

  // Drain the sample queue — streaming was already done above; start() triggers extraction.
  // Give the event loop a tick to flush buffered samples.
  await new Promise<void>((r) => setTimeout(r, 0));

  // Find keyframe at-or-before desiredStartUs
  let firstKeyframeIdx = 0;
  for (let i = 0; i < samplesQueue.length; i++) {
    const sUs = (samplesQueue[i].cts / samplesQueue[i].timescale) * 1_000_000;
    if (samplesQueue[i].is_sync && sUs <= desiredStartUs) firstKeyframeIdx = i;
    if (sUs > desiredEndUs) break;
  }

  let totalFrames = 0;
  for (let i = firstKeyframeIdx; i < samplesQueue.length; i++) {
    const s = samplesQueue[i];
    const sUs = (s.cts / s.timescale) * 1_000_000;
    if (sUs > desiredEndUs) break;
    decoder.decode(new EncodedVideoChunk({
      type: s.is_sync ? "key" : "delta",
      timestamp: sUs,
      duration: (s.duration / s.timescale) * 1_000_000,
      data: s.data!,
    }));
    totalFrames++;
  }

  await decoder.flush();
  if (decoderError) throw decoderError;

  // Re-encode each decoded frame, skipping pre-roll (before desiredStartUs) and frames beyond endSec
  let outFrameIdx = 0;
  for (const frame of decodedFrames) {
    if (frame.timestamp < desiredStartUs) {
      frame.close();
      continue;
    }
    if (frame.timestamp > desiredEndUs) {
      frame.close();
      continue;
    }
    encoder.encode(frame, { keyFrame: outFrameIdx === 0 });
    frame.close();
    outFrameIdx++;
    opts.onProgress?.(outFrameIdx, totalFrames);
  }
  await encoder.flush();
  if (encoderError) throw encoderError;

  encoder.close();
  decoder.close();

  // Mux encoded chunks back into MP4 container via mp4-muxer
  const muxed = await muxAvcChunksToMp4(encodedChunks, { width, height, framerate });
  return new Blob([muxed], { type: "video/mp4" });
}

/**
 * Extracts the avcC box payload from the source track's sample description.
 * Skips the leading 8-byte box header (size + fourCC) — WebCodecs expects the raw record.
 */
function extractAvcConfig(mp4: ReturnType<typeof createFile>, trackId: number): Uint8Array {
  const trak = mp4.getTrackById(trackId);
  const entry = (trak as any)?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  const avcC = entry?.avcC;
  if (!avcC) throw new Error("Source track is missing avcC box (not H.264?)");

  const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
  avcC.write(stream);
  // avcC.write writes a full box; strip the leading 8-byte size+type header.
  return new Uint8Array(stream.buffer, 8);
}

async function muxAvcChunksToMp4(
  chunks: { data: Uint8Array; timestamp: number; duration: number; type: "key" | "delta" }[],
  cfg: { width: number; height: number; framerate: number }
): Promise<Uint8Array<ArrayBuffer>> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: "avc",
      width: cfg.width,
      height: cfg.height,
      frameRate: cfg.framerate,
    },
    fastStart: "in-memory",
  });
  for (const c of chunks) {
    muxer.addVideoChunk(
      new EncodedVideoChunk({
        type: c.type,
        timestamp: c.timestamp,
        duration: c.duration,
        data: c.data,
      }),
      undefined
    );
  }
  muxer.finalize();
  return new Uint8Array(muxer.target.buffer) as Uint8Array<ArrayBuffer>;
}

async function streamFileToMp4(
  file: File,
  mp4: ReturnType<typeof createFile>,
  signal?: AbortSignal,
): Promise<void> {
  const reader = file.stream().getReader();
  let offset = 0;
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
      const ab = MP4BoxBuffer.fromArrayBuffer(value.buffer, offset);
      mp4.appendBuffer(ab);
      offset += value.byteLength;
    }
  } catch (e) {
    reader.cancel(e);
    throw e;
  }
}
