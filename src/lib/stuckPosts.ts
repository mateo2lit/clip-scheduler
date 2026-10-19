// Finds due posts the worker never picked up. When the worker can't run (a bad WORKER_SECRET,
// a broken cron job, Vercel down), posts just stay `scheduled` with no error saved, so this is
// the only sign. See /api/health/stuck-posts.

/** The worker runs every minute, so a post this late was never picked up. */
export const STUCK_AFTER_MINUTES = 15;
/** While posts stay stuck, email at most this often. */
export const ALERT_EVERY_HOURS = 6;

type DuePost = { scheduled_for: string; upload_id: string | null };

export function summarizeStuckPosts(
  posts: DuePost[],
  renderingUploadIds: Set<string>,
  now: number
): { count: number; oldestMinutes: number } {
  const cutoff = now - STUCK_AFTER_MINUTES * 60_000;
  let count = 0;
  let oldest = now;
  for (const p of posts) {
    // AI Clips posts wait on purpose until their captioned video finishes rendering.
    if (p.upload_id && renderingUploadIds.has(p.upload_id)) continue;
    const due = Date.parse(p.scheduled_for);
    if (!(due < cutoff)) continue;
    count++;
    if (due < oldest) oldest = due;
  }
  return { count, oldestMinutes: count ? Math.floor((now - oldest) / 60_000) : 0 };
}
