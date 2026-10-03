// src/lib/aiClips/finishLargeJob.ts
// Last step of a large-file AI Clips job, run in the browser that holds the video:
// cut every detected moment, upload each clip, and attach them to the job so the
// project shows the same clip grid as a small-file job.

import { encodeClip } from "@/lib/aiClips/clipEncoder";

/** `fraction` (0-1) is how much of the current clip's upload has been sent. */
export type FinishProgress = { phase: "cutting" | "uploading" | "saving"; clip: number; total: number; fraction?: number };

function putWithProgress(url: string, blob: Blob, onFraction: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onFraction(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "video/mp4");
    xhr.send(blob);
  });
}

type LargeJob = {
  id: string;
  result_moments_json?: { start_sec: number; end_sec: number }[] | null;
};

export async function finishLargeJob(
  file: Blob,
  job: LargeJob,
  token: string,
  onProgress: (p: FinishProgress) => void,
): Promise<void> {
  const moments = job.result_moments_json ?? [];
  if (!moments.length) throw new Error("No moments were found in this video.");

  const clips: { upload_id: string; start_sec: number }[] = [];
  for (let i = 0; i < moments.length; i++) {
    const m = moments[i];
    onProgress({ phase: "cutting", clip: i + 1, total: moments.length });
    const { blob, startSec } = await encodeClip(file, { startSec: m.start_sec, endSec: m.end_sec });

    onProgress({ phase: "uploading", clip: i + 1, total: moments.length, fraction: 0 });
    // Clips keep the source quality (~100 MB for 45 s of 1080p60), so on a slow
    // connection this is the long part: upload through a signed URL to report progress.
    const urlRes = await fetch(`/api/ai-clips/${job.id}/clip-upload-url`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ index: i }),
    });
    const signed = await urlRes.json().catch(() => null);
    if (!urlRes.ok || !signed?.ok) throw new Error(`Uploading clip ${i + 1} failed: ${signed?.error || "no upload URL"}`);
    const objectKey: string = signed.path;
    await putWithProgress(signed.uploadUrl, blob, (fraction) =>
      onProgress({ phase: "uploading", clip: i + 1, total: moments.length, fraction }),
    ).catch((e) => { throw new Error(`Uploading clip ${i + 1} failed: ${e.message}`); });

    const res = await fetch("/api/uploads/create", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "clips", file_path: objectKey, file_size: blob.size }),
    });
    const out = await res.json().catch(() => null);
    if (!res.ok || !out?.ok) throw new Error(out?.error || `Saving clip ${i + 1} failed.`);
    clips.push({ upload_id: out.id, start_sec: startSec });
  }

  onProgress({ phase: "saving", clip: moments.length, total: moments.length });
  const res = await fetch(`/api/ai-clips/${job.id}/clips`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ clips }),
  });
  const out = await res.json().catch(() => null);
  if (!res.ok || !out?.ok) throw new Error(out?.error || "Saving your clips failed.");
}
