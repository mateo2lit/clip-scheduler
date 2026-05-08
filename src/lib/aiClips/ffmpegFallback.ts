// src/lib/aiClips/ffmpegFallback.ts
import type { ExtractedChunk, ExtractOptions } from "@/lib/aiClips/audioExtractor";

let ffmpegPromise: Promise<any> | null = null;

async function loadFfmpeg() {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ffmpeg = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ffmpeg;
  })();
  return ffmpegPromise;
}

export async function* extractAudioChunksFfmpeg(
  file: File,
  opts: ExtractOptions = {}
): AsyncGenerator<ExtractedChunk> {
  const chunkSeconds = opts.chunkSeconds ?? 30;
  const ffmpeg = await loadFfmpeg();

  const inputName = "input." + (file.name.split(".").pop() || "bin");
  await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));

  // First pass: probe duration
  let totalSec = 0;
  ffmpeg.on("log", ({ message }: { message: string }) => {
    const m = /Duration:\s+(\d+):(\d+):(\d+\.\d+)/.exec(message);
    if (m) totalSec = +m[1] * 3600 + +m[2] * 60 + +m[3];
  });
  await ffmpeg.exec(["-i", inputName]).catch(() => undefined);  // probe-only; fails with no output

  if (!totalSec) throw new Error("Could not determine audio duration via FFmpeg.wasm.");

  const numChunks = Math.ceil(totalSec / chunkSeconds);
  for (let i = 0; i < numChunks; i++) {
    const startSec = i * chunkSeconds;
    const endSec = Math.min(startSec + chunkSeconds, totalSec);
    const outName = `chunk_${i}.opus`;
    await ffmpeg.exec([
      "-ss", String(startSec),
      "-t", String(endSec - startSec),
      "-i", inputName,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "libopus",
      "-b:a", "24k",
      outName,
    ]);
    const data = await ffmpeg.readFile(outName);
    const blob = new Blob([data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data], { type: "audio/ogg; codecs=opus" });
    await ffmpeg.deleteFile(outName);
    opts.onProgress?.(endSec, totalSec);
    yield { index: i, startSec, endSec, blob };
  }

  await ffmpeg.deleteFile(inputName);
}
