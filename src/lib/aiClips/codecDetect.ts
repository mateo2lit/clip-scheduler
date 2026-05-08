// src/lib/aiClips/codecDetect.ts
import type { CodecCapabilities } from "@/types/aiClipsLarge";

const MOBILE_UA_RE = /Mobi|Android|iPhone|iPad|iPod/i;

async function detectContainer(file: File): Promise<CodecCapabilities["container"]> {
  // Check magic bytes (first 12 bytes are enough for most containers)
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  // ftyp box at offset 4 → MP4-family
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    // major brand at offset 8
    const majorBrand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (majorBrand === "qt  ") return "mov";
    return "mp4";
  }

  // EBML/Matroska header: 0x1A 0x45 0xDF 0xA3
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    // distinguishing webm from mkv requires reading DocType — for our purposes treat both as 'mkv'
    if (file.type === "video/webm") return "webm";
    return "mkv";
  }

  return "other";
}

async function checkAudioEncoderOpus(): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const probe = await AudioEncoder.isConfigSupported({
      codec: "opus",
      sampleRate: 16000,
      numberOfChannels: 1,
      bitrate: 24000,
    });
    return !!probe.supported;
  } catch {
    return false;
  }
}

async function checkVideoEncoderH264(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    const probe = await VideoEncoder.isConfigSupported({
      codec: "avc1.42E01E",  // H.264 baseline level 3.0
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      framerate: 30,
    });
    return !!probe.supported;
  } catch {
    return false;
  }
}

export async function detectCodecCapabilities(file: File): Promise<CodecCapabilities> {
  const isMobile = typeof navigator !== "undefined" && MOBILE_UA_RE.test(navigator.userAgent);
  const container = await detectContainer(file);
  const reasons: string[] = [];

  const audioOk = await checkAudioEncoderOpus();
  const videoOk = await checkVideoEncoderH264();
  const webcodecsAvailable = audioOk && videoOk;

  if (!audioOk) reasons.push("Browser cannot encode Opus audio (WebCodecs AudioEncoder unsupported).");
  if (!videoOk) reasons.push("Browser cannot encode H.264 video (WebCodecs VideoEncoder unsupported).");

  // Mobile: refuse the large-file path even if WebCodecs reports supported
  // (memory limits + thermal throttling make it unreliable)
  if (isMobile) {
    reasons.push("Large-file processing isn't supported on mobile — try a desktop browser, or paste a URL instead.");
    return { canExtract: false, encoder: null, container, isMobile, reasons };
  }

  if (webcodecsAvailable && container === "mp4") {
    return { canExtract: true, encoder: "webcodecs", container, isMobile, reasons: [] };
  }

  // Non-MP4 containers fall back to FFmpeg.wasm (slower, larger bundle).
  // We still require a working WebCodecs encoder for the final clip output, OR FFmpeg can do encode too.
  if (container !== "mp4") {
    return { canExtract: true, encoder: "ffmpegwasm", container, isMobile, reasons: [] };
  }

  // MP4 but no WebCodecs → fall back to FFmpeg.wasm
  return { canExtract: true, encoder: "ffmpegwasm", container, isMobile, reasons };
}
