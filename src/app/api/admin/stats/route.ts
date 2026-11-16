import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { getStatsApiSecret } from "@/lib/statsSecret";
import { buildPeriod, parseDays } from "@/lib/analystStats/period";
import { getGa4Stats } from "@/lib/analystStats/ga4";
import { getProductStats, parseExcludedTeamIds } from "@/lib/analystStats/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only growth totals for an outside analyst bot, which can only open a URL:
//   GET /api/admin/stats?key=<STATS_API_SECRET>&days=7   (or Authorization: Bearer <secret>)
// Totals only: counts, sums, rates and breakdowns by platform, plan, channel or page path. Never
// emails, names, ids, tokens, titles or file paths. Fails closed when STATS_API_SECRET is unset.
// GA4 and Supabase fail separately: a broken section comes back { ok: false, error } and the
// other still answers. Stripe is left out on purpose (the bot reads Stripe itself).

const NO_STORE = { "Cache-Control": "no-store" };

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Constant-time compare; hashing first makes the lengths equal so length isn't leaked either. */
function sameSecret(given: string, secret: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

function providedKeys(req: Request, url: URL): string[] {
  const keys: string[] = [];
  const q = url.searchParams.get("key");
  if (q && q.trim()) keys.push(q.trim());
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (m && m[1].trim()) keys.push(m[1].trim());
  return keys;
}

const DEFINITIONS = {
  period:
    "Current period = the last `days` x 24 hours up to generated_at (UTC). Previous period = the same length right before it. Every time-based metric has current and previous values for comparison.",
  ga4: "Website traffic from Google Analytics 4. GA4 uses whole calendar days in the property's time zone, so its ranges (ga4.date_ranges) are the last `days` days including today, and the `days` days before that. Today is partial.",
  "ga4.totals.sessions": "Website visits (a visit ends after 30 minutes of inactivity).",
  "ga4.totals.total_users": "Distinct visitors who had any activity on the site.",
  "ga4.totals.new_users": "Visitors on their first ever visit.",
  "ga4.totals.engagement_rate": "Share of sessions that were engaged (lasted 10s+, had a key event, or viewed 2+ pages), 0 to 1.",
  "ga4.totals.key_events": "Key events (conversions) as marked in GA4. Omitted and listed in skipped_metrics if the property doesn't report them.",
  "ga4.channels": "Sessions by GA4 default channel group (Organic Search, Direct, Referral, Organic Social...), all channels.",
  "ga4.top_sources": "Top 10 traffic sources (e.g. google, t.co, (direct)) by current-period sessions.",
  "ga4.top_landing_pages": "Top 10 landing page paths (first page of a visit, without query string) by current-period sessions.",
  product: "ClipDash app data from the database. Internal and test teams listed in STATS_EXCLUDE_TEAM_IDS are left out of every product number (excluded_team_count says how many).",
  "product.signups": "New teams created in the period. Every new account that signs up without an invite gets its own team, so this is new signups; people who join an existing team by invite are not counted.",
  "product.teams_snapshot":
    "All teams right now (not period-based) by plan (creator, team, none = no paid plan) and plan_status from Stripe (trialing, active, past_due, canceled, none = never started checkout). There is no history, so no previous value.",
  "product.connected_accounts_snapshot": "Social accounts connected right now, by platform (not period-based).",
  "product.posts_published": "Posts successfully published in the period, by platform, counted by the time they went out. One post to 3 platforms counts as 3.",
  "product.posts_failed": "Posts that failed, by platform, counted by their scheduled time (failures have no separate timestamp).",
  "product.post_failure_rate": "posts_failed.total / (posts_published.total + posts_failed.total), 0 to 1; null when there were no posts.",
  "product.ai_clips":
    "AI Clips jobs started in the period: job count, count by status (done, failed, or still running), minutes_submitted = total length of source videos, minutes_completed = the same for jobs that finished (status done).",
  errors: "A section or metric that couldn't be read is { ok: false, error } instead of a number; the rest of the response is still valid.",
  truncated: "truncated: true on a metric means it hit the 100,000-row safety cap and is an undercount.",
};

export async function GET(req: Request) {
  const secret = getStatsApiSecret();
  if (!secret) return reply({ ok: false, error: "not configured" }, 503);

  const url = new URL(req.url);
  const keys = providedKeys(req, url);
  // Compare every candidate (no early exit) so timing doesn't reveal which one was checked.
  const authorized = keys.map((k) => sameSecret(k, secret)).some(Boolean);
  if (!authorized) return reply({ ok: false, error: "unauthorized" }, 401);

  const now = Date.now();
  const days = parseDays(url.searchParams.get("days"));
  const period = buildPeriod(days, now);
  const excluded = parseExcludedTeamIds(process.env.STATS_EXCLUDE_TEAM_IDS);

  const [ga4, product] = await Promise.all([
    getGa4Stats(days, {
      propertyId: process.env.GA4_PROPERTY_ID,
      serviceAccountJson: process.env.GA4_SERVICE_ACCOUNT_JSON,
    }),
    (async () => {
      try {
        // Imported here so a missing Supabase env fails only this section, not the whole route.
        const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
        return await getProductStats(supabaseAdmin, period, excluded);
      } catch (e) {
        console.error("[admin/stats] product section failed:", (e as Error)?.message ?? e);
        return { ok: false as const, error: "database unavailable" };
      }
    })(),
  ]);

  return reply({
    ok: true,
    generated_at: new Date(now).toISOString(),
    period,
    ga4,
    product,
    definitions: DEFINITIONS,
  });
}
