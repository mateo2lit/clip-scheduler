// Google Analytics 4 totals for /api/admin/stats, via the GA4 Data API (googleapis, v1beta)
// with a service account that has Viewer access on the property.
//
// Env: GA4_PROPERTY_ID (numeric) and GA4_SERVICE_ACCOUNT_JSON (the whole key file pasted as one
// string). Errors come back short and never include the key, the JSON or Google's raw message.

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TOP_N = 10;
const REQUEST_TIMEOUT_MS = 15_000;

type Failed = { ok: false; error: string };

type ReportRow = {
  dimensionValues?: { value?: string | null }[] | null;
  metricValues?: { value?: string | null }[] | null;
};
type Report = { dimensionHeaders?: { name?: string | null }[] | null; rows?: ReportRow[] | null };
type ReportRequest = {
  dateRanges: { startDate: string; endDate: string; name: string }[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  orderBys?: { metric: { metricName: string }; desc: boolean }[];
  limit?: string;
};
export type RunReport = (body: ReportRequest) => Promise<Report>;

type Credentials = { client_email: string; private_key: string };

/** Reads the service-account JSON. Returns a reason (never the value) when it can't be used. */
export function parseServiceAccount(raw: string | undefined): Credentials | string {
  const text = (raw ?? "").trim();
  if (!text) return "GA4_SERVICE_ACCOUNT_JSON is not set";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "GA4_SERVICE_ACCOUNT_JSON is not valid JSON";
  }
  const p = parsed as Partial<Credentials> | null;
  if (!p || typeof p.client_email !== "string" || typeof p.private_key !== "string" || !p.client_email || !p.private_key) {
    return "GA4_SERVICE_ACCOUNT_JSON is missing client_email or private_key";
  }
  // Keys pasted into env vars often carry literal "\n" instead of line breaks.
  return { client_email: p.client_email, private_key: p.private_key.replace(/\\n/g, "\n") };
}

/** Accepts "123456789" or "properties/123456789". */
export function parsePropertyId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim().replace(/^properties\//, "");
  return /^\d{1,20}$/.test(id) ? id : null;
}

/** GA4 relative dates for the last `days` calendar days (including today) and the `days` before. */
export function ga4DateRanges(days: number) {
  return {
    current: { startDate: days === 1 ? "today" : `${days - 1}daysAgo`, endDate: "today" },
    previous: { startDate: `${2 * days - 1}daysAgo`, endDate: days === 1 ? "yesterday" : `${days}daysAgo` },
  };
}

function shortGoogleError(e: unknown): string {
  const err = e as { code?: unknown; status?: unknown; response?: { status?: unknown } } | null;
  const status = err?.response?.status ?? err?.status ?? err?.code;
  return typeof status === "number" || (typeof status === "string" && /^\w{1,30}$/.test(status))
    ? `GA4 request failed (${status})`
    : "GA4 request failed";
}

async function defaultRunReport(propertyId: string, creds: Credentials): Promise<RunReport> {
  const { google } = await import("googleapis");
  const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key, scopes: [SCOPE] });
  const analyticsdata = google.analyticsdata({ version: "v1beta", auth });
  return async (body) => {
    const res = await analyticsdata.properties.runReport(
      { property: `properties/${propertyId}`, requestBody: body },
      { timeout: REQUEST_TIMEOUT_MS }
    );
    return res.data as Report;
  };
}

/** Splits a two-range report into current/previous rows. The API adds a "dateRange" dimension. */
function byRange(report: Report): { current: ReportRow[]; previous: ReportRow[] } {
  const headers = (report.dimensionHeaders ?? []).map((h) => h.name);
  const out = { current: [] as ReportRow[], previous: [] as ReportRow[] };
  for (const row of report.rows ?? []) {
    const values = row.dimensionValues ?? [];
    let idx = headers.indexOf("dateRange");
    if (idx < 0) idx = values.length - 1;
    const range = values[idx]?.value;
    if (range === "current") out.current.push(row);
    else if (range === "previous") out.previous.push(row);
  }
  return out;
}

function num(v: string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const TOTAL_METRICS = [
  { api: "sessions", out: "sessions" },
  { api: "totalUsers", out: "total_users" },
  { api: "newUsers", out: "new_users" },
  { api: "engagementRate", out: "engagement_rate" },
] as const;

async function totals(run: RunReport, dateRanges: ReportRequest["dateRanges"]) {
  const report = await run({ dateRanges, metrics: TOTAL_METRICS.map((m) => ({ name: m.api })) });
  const split = byRange(report);
  const pick = (rows: ReportRow[]) => {
    const values = rows[0]?.metricValues ?? [];
    const o: Record<string, number> = {};
    TOTAL_METRICS.forEach((m, i) => {
      const v = num(values[i]?.value);
      o[m.out] = m.out === "engagement_rate" ? Math.round(v * 10000) / 10000 : v;
    });
    return o;
  };
  return { current: pick(split.current), previous: pick(split.previous) };
}

/** Key events (formerly "conversions"). Newer properties use keyEvents; older API setups conversions. */
async function keyEvents(run: RunReport, dateRanges: ReportRequest["dateRanges"]) {
  for (const name of ["keyEvents", "conversions"]) {
    try {
      const split = byRange(await run({ dateRanges, metrics: [{ name }] }));
      return {
        current: num(split.current[0]?.metricValues?.[0]?.value),
        previous: num(split.previous[0]?.metricValues?.[0]?.value),
      };
    } catch {
      // try the next name; if neither works the metric is skipped
    }
  }
  return null;
}

/** Sessions by one dimension, top N by the current period, with the previous period alongside. */
async function breakdown(run: RunReport, dateRanges: ReportRequest["dateRanges"], dimension: string, outKey: string, topN: number | null) {
  const report = await run({
    dateRanges,
    dimensions: [{ name: dimension }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: "1000",
  });
  const split = byRange(report);
  const rows = new Map<string, { current: number; previous: number }>();
  const add = (list: ReportRow[], which: "current" | "previous") => {
    for (const r of list) {
      const key = String(r.dimensionValues?.[0]?.value ?? "(not set)").slice(0, 200);
      const entry = rows.get(key) ?? { current: 0, previous: 0 };
      entry[which] += num(r.metricValues?.[0]?.value);
      rows.set(key, entry);
    }
  };
  add(split.current, "current");
  add(split.previous, "previous");
  const sorted = Array.from(rows.entries())
    .sort((a, b) => b[1].current - a[1].current || b[1].previous - a[1].previous)
    .map(([key, v]) => ({ [outKey]: key, sessions_current: v.current, sessions_previous: v.previous }));
  return topN ? sorted.slice(0, topN) : sorted;
}

export async function getGa4Stats(
  days: number,
  env: { propertyId?: string; serviceAccountJson?: string },
  runOverride?: RunReport
): Promise<Record<string, unknown> | Failed> {
  const propertyId = parsePropertyId(env.propertyId);
  if (!propertyId) return { ok: false, error: env.propertyId?.trim() ? "GA4_PROPERTY_ID is not numeric" : "GA4_PROPERTY_ID is not set" };
  const creds = parseServiceAccount(env.serviceAccountJson);
  if (typeof creds === "string") return { ok: false, error: creds };

  const ranges = ga4DateRanges(days);
  const dateRanges = [
    { ...ranges.current, name: "current" },
    { ...ranges.previous, name: "previous" },
  ];

  try {
    const run = runOverride ?? (await defaultRunReport(propertyId, creds));
    // Totals must work; the rest are best-effort so one bad dimension doesn't sink the section.
    const [total, events, channels, sources, pages] = await Promise.all([
      totals(run, dateRanges),
      keyEvents(run, dateRanges),
      breakdown(run, dateRanges, "sessionDefaultChannelGroup", "channel", null).catch(() => null),
      breakdown(run, dateRanges, "sessionSource", "source", TOP_N).catch(() => null),
      breakdown(run, dateRanges, "landingPage", "page", TOP_N).catch(() => null),
    ]);
    const skipped: string[] = [];
    if (events) {
      total.current.key_events = events.current;
      total.previous.key_events = events.previous;
    } else skipped.push("key_events");
    if (!channels) skipped.push("channels");
    if (!sources) skipped.push("top_sources");
    if (!pages) skipped.push("top_landing_pages");
    return {
      ok: true,
      date_ranges: ranges,
      totals: total,
      ...(channels ? { channels } : {}),
      ...(sources ? { top_sources: sources } : {}),
      ...(pages ? { top_landing_pages: pages } : {}),
      ...(skipped.length ? { skipped_metrics: skipped } : {}),
    };
  } catch (e) {
    // Server log only (private): Google's message helps fix setup, e.g. a missing Viewer grant.
    console.error("[admin/stats] GA4 failed:", shortGoogleError(e), (e as Error)?.message ?? "");
    return { ok: false, error: shortGoogleError(e) };
  }
}
