// The one place WORKER_SECRET and CRON_SECRET are read.
//
// Values pasted into Vercel can pick up a trailing space or line break. Callers trim the token
// they receive, so an untrimmed env value never matches: on 2026-10-17 a trailing space made
// every cron call fail with "Unauthorized worker request" and no posts went out for two days.
// An unset or blank secret comes back as "", and callers must treat that as "refuse everyone".

export function getWorkerSecret(): string {
  return (process.env.WORKER_SECRET ?? "").trim();
}

export function getCronSecret(): string {
  return (process.env.CRON_SECRET ?? "").trim();
}
