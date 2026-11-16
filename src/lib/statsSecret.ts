// The one place STATS_API_SECRET is read. It guards /api/admin/stats, the read-only totals
// endpoint an outside analyst bot fetches by URL.
//
// Trimmed for the same reason as WORKER_SECRET (see workerSecret.ts): a value pasted into Vercel
// can pick up a trailing space or line break. An unset or blank secret comes back as "", and the
// route must treat that as "refuse everyone".

export function getStatsApiSecret(): string {
  return (process.env.STATS_API_SECRET ?? "").trim();
}
