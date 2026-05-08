// src/lib/aiClips/chunkedUploader.ts
import type { ExtractedChunk } from "@/lib/aiClips/audioExtractor";
import type { ChunkUploadToken } from "@/types/aiClipsLarge";

export type UploadOptions = {
  endpoint?: string;            // default "/api/ai-clips/audio-chunk"
  maxAttempts?: number;         // default 3
  onChunkUploaded?: (index: number, total: number | null) => void;
};

const DEFAULT_ENDPOINT = "/api/ai-clips/audio-chunk";
const DEFAULT_MAX_ATTEMPTS = 3;

export async function uploadChunkStream(
  chunks: AsyncIterable<ExtractedChunk>,
  token: ChunkUploadToken,
  opts: UploadOptions = {}
): Promise<{ chunksUploaded: number }> {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let count = 0;

  for await (const chunk of chunks) {
    let attempt = 0;
    let lastErr: Error | null = null;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        await uploadOne(endpoint, token, chunk);
        count++;
        opts.onChunkUploaded?.(chunk.index, null);
        lastErr = null;
        break;
      } catch (e: any) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (attempt < maxAttempts) {
          const backoffMs = 500 * Math.pow(2, attempt - 1) + Math.random() * 250;
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }
    if (lastErr) throw new Error(`Chunk ${chunk.index} upload failed after ${maxAttempts} attempts: ${lastErr.message}`);
  }

  return { chunksUploaded: count };
}

async function uploadOne(endpoint: string, token: ChunkUploadToken, chunk: ExtractedChunk): Promise<void> {
  const fd = new FormData();
  fd.append("token", token);
  fd.append("index", String(chunk.index));
  fd.append("startSec", String(chunk.startSec));
  fd.append("endSec", String(chunk.endSec));
  fd.append("chunk", chunk.blob, `chunk_${String(chunk.index).padStart(3, "0")}.opus`);

  const res = await fetch(endpoint, { method: "POST", body: fd });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`API error: ${json.error || "unknown"}`);
}
