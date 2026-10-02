// Import-free so tests can load it directly.
/**
 * Whether a scheduled post's video can be published yet. AI Clips reserves the captioned
 * upload before its render finishes (render_status 'rendering'); the worker must wait for
 * it, and never publish an uncaptioned or missing file.
 */
export const RENDER_TIMEOUT_MS = 20 * 60 * 1000;

export const RENDER_FAILED_MESSAGE =
  "Captions couldn't be added to this video. Open the clip in AI Clips and use Retry, or post it again.";

export function renderGate(
  upload: { render_status?: string | null; render_started_at?: string | null } | null,
  nowMs: number = Date.now()
): "ready" | "wait" | "fail" {
  const status = upload?.render_status ?? null;
  if (status === null) return "ready";
  if (status === "failed") return "fail";
  if (status === "rendering") {
    const started = upload?.render_started_at ? Date.parse(upload.render_started_at) : NaN;
    if (Number.isFinite(started) && nowMs - started > RENDER_TIMEOUT_MS) return "fail";
    return "wait";
  }
  return "ready";
}
