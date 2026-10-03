// src/lib/aiClips/clipEncoder.ts
// Cuts a clip out of a large local MP4 for the large-file AI Clips path.
//
// It remuxes instead of re-encoding: the sample tables in moov say where every
// video and audio frame is, so only the clip's bytes are read from the file and
// handed straight to mp4-muxer. The old version streamed the whole file through
// mp4box (which kept all of it in memory, the same NotReadableError bug as the
// audio extractor), decoded every frame into memory, and dropped the audio.
//
// The clip starts on the keyframe at or before startSec, because a remux can
// only cut on keyframes; for typical exports that is at most a couple of seconds early.

import { createFile, DataStream, Endianness } from "mp4box";
import { primeMp4WithMoov } from "@/lib/aiClips/audioExtractor";
import { planReads, type AacSample } from "@/lib/aiClips/aacChunks";

export type EncodeClipOptions = {
  startSec: number;
  endSec: number;
  onProgress?: (done: number, total: number | undefined) => void;
};

type TrakSample = AacSample & { cts: number; is_sync: boolean };

export async function encodeClip(file: Blob, opts: EncodeClipOptions): Promise<Blob> {
  const mp4 = createFile();
  const info = await primeMp4WithMoov(file, mp4);

  const videoTrack = info.tracks.find((t) => t.type === "video");
  if (!videoTrack) throw new Error("No video track in source.");
  const vTrak: any = mp4.getTrackById(videoTrack.id);
  const vEntry = vTrak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  if (!vEntry?.avcC) throw new Error("This video isn't H.264, which large-file clips need. Re-export it as H.264 MP4.");
  const vSamples: TrakSample[] = vTrak.samples ?? [];

  const audioTrack = info.tracks.find((t) => t.type === "audio");
  const aTrak: any = audioTrack ? mp4.getTrackById(audioTrack.id) : null;
  const asc = aTrak ? findDecoderSpecificInfo(aTrak.mdia?.minf?.stbl?.stsd?.entries?.[0]?.esds?.esd) : null;
  const aSamples: TrakSample[] = audioTrack?.codec?.startsWith("mp4a") && asc ? aTrak.samples ?? [] : [];

  const cut = selectClipSamples(vSamples, aSamples, opts.startSec, opts.endSec);
  if (!cut.video.length) throw new Error("This moment is outside the video.");

  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: videoTrack.video?.width ?? 1920, height: videoTrack.video?.height ?? 1080 },
    ...(cut.audio.length
      ? { audio: { codec: "aac" as const, numberOfChannels: audioTrack!.audio?.channel_count ?? 2, sampleRate: audioTrack!.audio?.sample_rate ?? 48000 } }
      : {}),
    // Reserve moov space up front: same fast-start file as "in-memory" without holding
    // every chunk a second time until finalize.
    fastStart: { expectedVideoChunks: cut.video.length, expectedAudioChunks: cut.audio.length },
    firstTimestampBehavior: "offset",
  });

  const vMeta = {
    decoderConfig: {
      codec: videoTrack.codec,
      codedWidth: videoTrack.video?.width,
      codedHeight: videoTrack.video?.height,
      description: avcConfigRecord(vEntry.avcC),
    },
  } as EncodedVideoChunkMetadata;
  const aMeta = cut.audio.length
    ? ({ decoderConfig: { codec: audioTrack!.codec, sampleRate: audioTrack!.audio?.sample_rate, numberOfChannels: audioTrack!.audio?.channel_count, description: asc } } as EncodedAudioChunkMetadata)
    : undefined;

  const us = (t: number, ts: number) => Math.round((t / ts) * 1_000_000);
  const total = cut.video.length + cut.audio.length;
  let done = 0;

  // Video and audio are muxed into separate tracks, so each can be added in its own order.
  await readSamples(file, cut.video, (s, data, first) => {
    muxer.addVideoChunkRaw(data, s.is_sync ? "key" : "delta", us(s.cts, s.timescale), us(s.duration, s.timescale),
      first ? vMeta : undefined, us(s.cts - s.dts, s.timescale));
    opts.onProgress?.(++done, total);
  });
  await readSamples(file, cut.audio, (s, data, first) => {
    muxer.addAudioChunkRaw(data, "key", us(s.dts, s.timescale), us(s.duration, s.timescale), first ? aMeta : undefined);
    opts.onProgress?.(++done, total);
  });

  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

/**
 * Picks the decode-order run of video samples from the keyframe at or before
 * startSec up to endSec, and the audio samples over the same span. A
 * decode-order prefix starting on a keyframe is always decodable.
 */
export function selectClipSamples<T extends TrakSample>(video: T[], audio: T[], startSec: number, endSec: number) {
  let first = -1;
  for (let i = 0; i < video.length; i++) {
    const s = video[i];
    if (s.dts / s.timescale > startSec) break;
    if (s.is_sync && s.cts / s.timescale <= startSec) first = i;
  }
  if (first < 0) first = video.findIndex((s) => s.is_sync);
  if (first < 0) return { video: [] as T[], audio: [] as T[] };

  let last = first;
  while (last + 1 < video.length && video[last + 1].dts / video[last + 1].timescale < endSec) last++;
  const clipVideo = video.slice(first, last + 1);

  const fromSec = clipVideo[0].cts / clipVideo[0].timescale;
  const toSec = Math.max(...clipVideo.map((s) => (s.cts + s.duration) / s.timescale));
  const clipAudio = audio.filter((s) => s.dts / s.timescale >= fromSec && s.dts / s.timescale < toSec);
  return { video: clipVideo, audio: clipAudio };
}

/** Reads samples by byte range (batched, never the whole file) and hands each one over in order. */
async function readSamples<T extends TrakSample>(
  file: Blob,
  samples: T[],
  onSample: (s: T, data: Uint8Array, first: boolean) => void,
): Promise<void> {
  for (const read of planReads(samples)) {
    const bytes = new Uint8Array(await file.slice(read.start, read.end).arrayBuffer());
    for (let i = read.first; i <= read.last; i++) {
      const s = samples[i];
      const at = s.offset - read.start;
      onSample(s, bytes.subarray(at, at + s.size), i === 0);
    }
  }
}

/** The avcC payload WebCodecs/mp4-muxer expect: the box minus its 8-byte header. */
function avcConfigRecord(avcC: any): Uint8Array {
  const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
  avcC.write(stream);
  return new Uint8Array(stream.buffer, 8);
}

function findDecoderSpecificInfo(d: any): Uint8Array | null {
  if (!d) return null;
  if (d.tag === 5 && d.data?.length) return new Uint8Array(d.data);
  for (const c of d.descs ?? []) {
    const r = findDecoderSpecificInfo(c);
    if (r) return r;
  }
  return null;
}
