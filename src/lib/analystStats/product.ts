// Product totals for /api/admin/stats, read from Supabase with the service-role client.
//
// Totals only: queries select just the column being grouped (provider, plan, status...) and the
// output is counts keyed by those values. No ids, emails, names, titles or paths ever leave here.
// Each metric fails on its own, so one broken query doesn't hide the rest.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Period } from "./period";
import { ratio } from "./period";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

const PAGE_SIZE = 1000; // Supabase's default max rows per request
const MAX_PAGES = 100; // 100k rows per metric; beyond that the metric says truncated: true

type Failed = { ok: false; error: string };
type Counts = Record<string, number>;

/** Team ids from STATS_EXCLUDE_TEAM_IDS (comma or space separated). Anything not shaped like an id is dropped. */
export function parseExcludedTeamIds(raw: string | undefined): string[] {
  return Array.from(
    new Set(
      (raw ?? "")
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => /^[0-9A-Za-z-]{1,64}$/.test(s))
    )
  );
}

class QueryError extends Error {
  constructor(public code: string | undefined, message: string) {
    super(message);
  }
}

function check(error: { code?: string; message?: string } | null) {
  if (error) throw new QueryError(error.code, error.message ?? "query failed");
}

/** Runs one metric; on failure logs the detail server-side and returns a short, secret-free error. */
async function metric<T>(name: string, run: () => Promise<T>): Promise<T | Failed> {
  try {
    return await run();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error(`[admin/stats] ${name} failed:`, err?.message ?? e);
    const code = e instanceof QueryError && err.code && /^[0-9A-Za-z_]{1,10}$/.test(err.code) ? ` (${err.code})` : "";
    return { ok: false, error: `query failed${code}` };
  }
}

/** Leaves out excluded teams. `teams` is filtered on its own id; other tables on team_id (keeping legacy NULLs). */
function withoutTeams(q: Query, column: "id" | "team_id", ids: string[]): Query {
  if (!ids.length) return q;
  const list = `(${ids.join(",")})`;
  if (column === "id") return q.not("id", "in", list);
  return q.or(`team_id.is.null,team_id.not.in.${list}`);
}

/** Pages through a narrow select. `build` must return a fresh query each call. */
async function selectAll<T>(build: () => Query): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build().order("id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    check(error);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function label(v: unknown): string {
  if (v === null || v === undefined || v === "") return "none";
  return String(v).slice(0, 40);
}

/** Counts rows by one column, biggest first. */
function tally<T>(rows: T[], key: (row: T) => unknown): Counts {
  const counts: Counts = {};
  for (const r of rows) {
    const k = label(key(r));
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

type Range = { start: string; end: string };

async function signups(db: Db, ids: string[], r: Range): Promise<number> {
  const q = db.from("teams").select("id", { count: "exact", head: true }).gte("created_at", r.start).lt("created_at", r.end);
  const { count, error } = await withoutTeams(q, "id", ids);
  check(error);
  return count ?? 0;
}

async function teamsSnapshot(db: Db, ids: string[]) {
  type Row = { plan: string | null; plan_status: string | null };
  const { rows, truncated } = await selectAll<Row>(() => withoutTeams(db.from("teams").select("plan, plan_status"), "id", ids));
  const byPlanStatus: Record<string, Counts> = {};
  for (const r of rows) {
    const plan = label(r.plan);
    const status = label(r.plan_status);
    byPlanStatus[plan] ??= {};
    byPlanStatus[plan][status] = (byPlanStatus[plan][status] ?? 0) + 1;
  }
  return {
    total: rows.length,
    by_plan: tally(rows, (r) => r.plan),
    by_status: tally(rows, (r) => r.plan_status),
    by_plan_status: byPlanStatus,
    ...(truncated ? { truncated: true } : {}),
  };
}

async function connectedAccounts(db: Db, ids: string[]) {
  type Row = { provider: string | null };
  const { rows, truncated } = await selectAll<Row>(() =>
    withoutTeams(db.from("platform_accounts").select("provider"), "team_id", ids)
  );
  return { total: rows.length, by_provider: tally(rows, (r) => r.provider), ...(truncated ? { truncated: true } : {}) };
}

/** Posts in one status whose `timeColumn` falls in the range, grouped by platform. */
async function postsByProvider(db: Db, ids: string[], status: string, timeColumn: string, r: Range) {
  type Row = { provider: string | null };
  const { rows, truncated } = await selectAll<Row>(() =>
    withoutTeams(
      db.from("scheduled_posts").select("provider").eq("status", status).gte(timeColumn, r.start).lt(timeColumn, r.end),
      "team_id",
      ids
    )
  );
  return { total: rows.length, by_provider: tally(rows, (x) => x.provider), ...(truncated ? { truncated: true } : {}) };
}

async function aiClips(db: Db, ids: string[], r: Range) {
  type Row = { status: string | null; source_duration_minutes: number | string | null };
  const { rows, truncated } = await selectAll<Row>(() =>
    withoutTeams(
      db.from("ai_clip_jobs").select("status, source_duration_minutes").gte("created_at", r.start).lt("created_at", r.end),
      "team_id",
      ids
    )
  );
  let submitted = 0;
  let completed = 0;
  for (const row of rows) {
    const m = Number(row.source_duration_minutes);
    if (!Number.isFinite(m) || m < 0) continue;
    submitted += m;
    if (row.status === "done") completed += m;
  }
  return {
    jobs: rows.length,
    by_status: tally(rows, (x) => x.status),
    minutes_submitted: Math.round(submitted * 10) / 10,
    minutes_completed: Math.round(completed * 10) / 10,
    ...(truncated ? { truncated: true } : {}),
  };
}

function isFailed(v: unknown): v is Failed {
  return !!v && typeof v === "object" && (v as Failed).ok === false;
}

async function postsForRange(db: Db, ids: string[], r: Range) {
  const [published, failed] = await Promise.all([
    metric("posts_published", () => postsByProvider(db, ids, "posted", "posted_at", r)),
    metric("posts_failed", () => postsByProvider(db, ids, "failed", "scheduled_for", r)),
  ]);
  const failureRate =
    isFailed(published) || isFailed(failed) ? null : ratio(failed.total, published.total + failed.total);
  return { published, failed, failure_rate: failureRate };
}

export async function getProductStats(db: Db, period: Period, excludedTeamIds: string[]) {
  const ids = excludedTeamIds;
  const current = { start: period.start, end: period.end };
  const previous = { start: period.previous_start, end: period.previous_end };

  const [signupsNow, signupsBefore, teams, accounts, postsNow, postsBefore, clipsNow, clipsBefore] = await Promise.all([
    metric("signups", () => signups(db, ids, current)),
    metric("signups", () => signups(db, ids, previous)),
    metric("teams_snapshot", () => teamsSnapshot(db, ids)),
    metric("connected_accounts", () => connectedAccounts(db, ids)),
    postsForRange(db, ids, current),
    postsForRange(db, ids, previous),
    metric("ai_clips", () => aiClips(db, ids, current)),
    metric("ai_clips", () => aiClips(db, ids, previous)),
  ]);

  return {
    ok: true as const,
    excluded_team_count: ids.length,
    signups: { current: signupsNow, previous: signupsBefore },
    teams_snapshot: teams,
    connected_accounts_snapshot: accounts,
    posts_published: { current: postsNow.published, previous: postsBefore.published },
    posts_failed: { current: postsNow.failed, previous: postsBefore.failed },
    post_failure_rate: { current: postsNow.failure_rate, previous: postsBefore.failure_rate },
    ai_clips: { current: clipsNow, previous: clipsBefore },
  };
}
