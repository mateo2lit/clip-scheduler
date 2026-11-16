// Period maths for /api/admin/stats. The current period is the last `days` x 24 hours up to now;
// the previous period is the same length, right before it, so every metric can be compared.

export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `?days=` as a whole number from 1 to 90. Missing or unreadable means 7. */
export function parseDays(raw: string | null): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(1, n));
}

export type Period = {
  days: number;
  start: string;
  end: string;
  previous_start: string;
  previous_end: string;
};

export function buildPeriod(days: number, now: number): Period {
  const start = now - days * DAY_MS;
  return {
    days,
    start: new Date(start).toISOString(),
    end: new Date(now).toISOString(),
    previous_start: new Date(start - days * DAY_MS).toISOString(),
    previous_end: new Date(start).toISOString(),
  };
}

/** Rounds a ratio for output; null when there is nothing to divide by. */
export function ratio(numerator: number, denominator: number, places = 4): number | null {
  if (!denominator) return null;
  const f = 10 ** places;
  return Math.round((numerator / denominator) * f) / f;
}
