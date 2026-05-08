import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import ffmpegPath from "ffmpeg-static";

/**
 * Inspect the ISOBMFF `ftyp` box at the start of a video file to determine
 * whether the container is a true MP4 or a QuickTime variant. Bluesky's
 * blob server inspects bytes (not the Content-Type header), and its
 * app.bsky.feed.post lexicon requires the embed mimeType to be exactly
 * "video/mp4" — so QuickTime-wrapped clips fail post-record validation
 * even though the H.264 bitstream itself is identical.
 *
 * Returns:
 *   - "mp4"        major brand isom / mp4* / avc1 / iso2 / etc.
 *   - "quicktime"  major brand "qt  "
 *   - "unknown"    not an ISOBMFF file or unrecognized brand
 */
export function detectVideoContainer(
  buf: Buffer
): "mp4" | "quicktime" | "unknown" {
  if (buf.length < 16) return "unknown";
  // bytes 4..8 are the box type for the first box; should be "ftyp"
  if (buf.subarray(4, 8).toString("ascii") !== "ftyp") return "unknown";
  const major = buf.subarray(8, 12).toString("ascii");
  if (major === "qt  ") return "quicktime";
  if (
    major === "isom" ||
    major === "iso2" ||
    major.startsWith("mp4") ||
    major === "avc1" ||
    major === "M4V " ||
    major === "M4A "
  ) {
    return "mp4";
  }
  return "unknown";
}

/**
 * Remux a video buffer into a true MP4 container, copying the existing
 * audio/video streams without re-encoding (≤1s for typical short clips).
 * Returns the remuxed bytes.
 */
export async function remuxToMp4(input: Buffer): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary path is unavailable");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "remux-"));
  const id = crypto.randomBytes(4).toString("hex");
  const inputPath = path.join(tmpDir, `in-${id}.bin`);
  const outputPath = path.join(tmpDir, `out-${id}.mp4`);

  try {
    await fs.writeFile(inputPath, input);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        ffmpegPath as string,
        [
          "-y",
          "-i", inputPath,
          "-c", "copy",
          "-movflags", "+faststart",
          "-f", "mp4",
          outputPath,
        ],
        { stdio: ["ignore", "ignore", "pipe"] }
      );

      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg remux exited ${code}: ${stderr.slice(-500)}`));
      });
    });

    // Re-wrap so the result is Buffer<ArrayBuffer> (not ArrayBufferLike),
    // matching what fetch's BodyInit accepts in strict TS configs.
    const raw = await fs.readFile(outputPath);
    return Buffer.from(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  } finally {
    // Best-effort cleanup
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
