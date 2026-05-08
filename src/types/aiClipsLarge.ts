// src/types/aiClipsLarge.ts

export type ChunkUploadToken = string;  // opaque HMAC token

export type AudioChunkMeta = {
  index: number;
  startSec: number;
  endSec: number;
};

export type CodecEncoder = "webcodecs" | "ffmpegwasm" | null;

export type CodecCapabilities = {
  canExtract: boolean;
  encoder: CodecEncoder;
  container: "mp4" | "mkv" | "mov" | "webm" | "other";
  isMobile: boolean;
  reasons: string[];  // human-readable reasons for refusal, if any
};

export type MomentResult = {
  index: number;
  startSec: number;
  endSec: number;
  title: string;
  subtitlesJson?: any;
};

export type PrepareLargeResponse = {
  ok: true;
  jobId: string;
  chunkUploadToken: ChunkUploadToken;
  chunkBucket: string;
  chunkPathPrefix: string;
} | {
  ok: false;
  error: string;
};
