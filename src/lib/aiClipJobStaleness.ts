/**
 * Staleness rules for ai_clip_jobs.
 *
 * Deliberately import-free so it can be unit-tested standalone
 * (scripts/test-ai-clip-staleness.mjs).
 */

/** Statuses that count as "this team already has a job running". */
export const ACTIVE_AI_CLIP_STATUSES = [
  "pending",
  "uploading",
  "transcribing",
  "detecting",
  "cutting",
] as const;

export type ActiveAiClipStatus = (typeof ACTIVE_AI_CLIP_STATUSES)[number];

/**
 * How long a job may sit in a non-terminal status without being touched before
 * we call it dead.
 *
 * Three hours is chosen to clear two things at once: the generation workflow
 * gives up at 30 minutes, and a large-path upload heartbeats `updated_at` on
 * every audio chunk, so any live job refreshes far more often than this. A job
 * silent for three hours is not slow, it is abandoned — most often because the
 * browser tab doing the client-side work was closed mid-flight.
 */
export const STALE_ACTIVE_JOB_MS = 3 * 60 * 60 * 1000;

export function isActiveAiClipStatus(status: string | null | undefined): boolean {
  return ACTIVE_AI_CLIP_STATUSES.includes(status as ActiveAiClipStatus);
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * True when a job is holding the team's active-job slot but can no longer make
 * progress.
 *
 * Terminal jobs are never stale regardless of age. For active jobs the clock
 * runs from `updated_at`, falling back to `created_at` for rows that never
 * advanced past creation. A row with neither readable is treated as stale —
 * it cannot be shown to be alive, and leaving it would block the team forever.
 */
export function isStaleActiveJob(
  job: {
    status: string | null | undefined;
    updated_at?: string | null;
    created_at?: string | null;
  },
  now: Date = new Date()
): boolean {
  if (!isActiveAiClipStatus(job.status)) return false;

  const lastTouched = parseTime(job.updated_at) ?? parseTime(job.created_at);
  if (lastTouched === null) return true;

  return now.getTime() - lastTouched > STALE_ACTIVE_JOB_MS;
}
