"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type ScheduledPostRow = {
  id: string;
  upload_id: string | null;
  upload_title: string | null;
  upload_file_name: string | null;
  scheduled_for: string;
  platforms: any; // runtime-safe
  status: string | null;
  created_at: string | null;
};

type PlatformAccountRow = {
  provider: string; // "youtube" | ...
  created_at?: string | null;
  updated_at?: string | null;
  expiry?: string | null;
};

function normalizePlatforms(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

function fmtWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function titleFor(p: ScheduledPostRow) {
  return p.upload_title || p.upload_file_name || "Untitled";
}

function Pill({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: "neutral" | "scheduled" | "posted" | "connected" | "soon";
}) {
  const cls =
    variant === "scheduled"
      ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
      : variant === "posted"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : variant === "connected"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : variant === "soon"
      ? "bg-slate-500/10 text-slate-300 border-slate-500/25"
      : "bg-slate-500/15 text-slate-300 border-slate-500/30";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          {subtitle ? (
            <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur">
        {children}
      </div>
    </section>
  );
}

function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-6">
      <div className="text-sm font-medium text-slate-200">{title}</div>
      <div className="text-sm text-slate-400 mt-1">{desc}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function Row({
  p,
  variant,
}: {
  p: ScheduledPostRow;
  variant: "scheduled" | "posted";
}) {
  const platforms = normalizePlatforms(p.platforms);
  return (
    <div className="px-5 py-4 flex items-start justify-between gap-4 border-t border-slate-800 first:border-t-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-medium text-slate-100 truncate">
            {titleFor(p)}
          </div>
          <Pill variant={variant}>
            {variant === "scheduled" ? "Scheduled" : "Posted"}
          </Pill>
        </div>

        <div className="mt-1 text-xs text-slate-400">
          {variant === "scheduled" ? "Goes out" : "Went out"}:{" "}
          <span className="text-slate-200">{fmtWhen(p.scheduled_for)}</span>
        </div>

        <div className="mt-1 text-xs text-slate-500">
          Platforms:{" "}
          <span className="text-slate-300">
            {platforms.length ? platforms.join(", ") : "—"}
          </span>
        </div>
      </div>

      <div className="shrink-0 text-xs text-slate-500">
        {p.upload_id ? (
          <span className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1">
            linked upload
          </span>
        ) : (
          <span className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1">
            no upload id
          </span>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Connected Accounts UI ----------------------------- */

type ProviderId = "youtube" | "tiktok" | "instagram" | "x" | "facebook";

type ProviderConfig = {
  id: ProviderId;
  name: string;
  desc: string;
  availableNow: boolean;
  badge?: string;
};

const PROVIDERS: ProviderConfig[] = [
  {
    id: "youtube",
    name: "YouTube",
    desc: "Upload videos to your channel (manual + scheduled).",
    availableNow: true,
    badge: "Recommended",
  },
  {
    id: "tiktok",
    name: "TikTok",
    desc: "Schedule shorts and upload to TikTok.",
    availableNow: false,
    badge: "Popular",
  },
  {
    id: "instagram",
    name: "Instagram Reels",
    desc: "Schedule reels and publish automatically.",
    availableNow: false,
  },
  {
    id: "x",
    name: "X (Twitter)",
    desc: "Post clips as videos to X.",
    availableNow: false,
  },
  {
    id: "facebook",
    name: "Facebook",
    desc: "Post clips to Facebook pages and profiles.",
    availableNow: false,
  },
];

function prettyProvider(provider: string) {
  const p = PROVIDERS.find((x) => x.id === provider);
  return p?.name ?? provider;
}

export default function DashboardPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [upcoming, setUpcoming] = useState<ScheduledPostRow[]>([]);
  const [recentPosted, setRecentPosted] = useState<ScheduledPostRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [accounts, setAccounts] = useState<PlatformAccountRow[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);

      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }

      if (cancelled) return;

      setSessionEmail(auth.session.user.email ?? null);
      setAccessToken(auth.session.access_token ?? null);

      const upcomingRes = await supabase
        .from("scheduled_posts")
        .select(
          "id, upload_id, upload_title, upload_file_name, scheduled_for, platforms, status, created_at"
        )
        .eq("status", "scheduled")
        .order("scheduled_for", { ascending: true })
        .limit(20);

      const postedRes = await supabase
        .from("scheduled_posts")
        .select(
          "id, upload_id, upload_title, upload_file_name, scheduled_for, platforms, status, created_at"
        )
        .eq("status", "posted")
        .order("scheduled_for", { ascending: false })
        .limit(12);

      if (cancelled) return;

      setUpcoming(upcomingRes.data ?? []);
      setRecentPosted(postedRes.data ?? []);
      setLoading(false);
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadPlatformAccounts(token: string) {
    setAccountsLoading(true);
    setAccountsError(null);

    try {
      const res = await fetch("/api/platform-accounts", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const json = await res.json();

      // ✅ Your API shape: { ok: true, data: [...] }
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Failed to load connected accounts");
      }

      setAccounts(Array.isArray(json?.data) ? json.data : []);
    } catch (e: any) {
      setAccountsError(e?.message || "Unknown error");
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    loadPlatformAccounts(accessToken);
  }, [accessToken]);

  const connectedProviderSet = useMemo(() => {
    return new Set(accounts.map((a) => a.provider));
  }, [accounts]);

  const connectedProviders = useMemo(() => {
    return PROVIDERS.filter((p) => connectedProviderSet.has(p.id));
  }, [connectedProviderSet]);

  const availableProviders = useMemo(() => {
    return PROVIDERS.filter((p) => !connectedProviderSet.has(p.id));
  }, [connectedProviderSet]);

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, [now]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-120px] h-[420px] w-[780px] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-3xl" />
        <div className="absolute left-[10%] top-[280px] h-[320px] w-[520px] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Top bar */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-slate-400">{greeting}</div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <div className="mt-1 text-sm text-slate-400 truncate">
              {sessionEmail ? sessionEmail : "—"}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/uploads"
              className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm hover:bg-slate-900"
            >
              Upload library
            </Link>

            <Link
              href="/upload"
              className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
            >
              + Upload new video
            </Link>
          </div>
        </div>

        {/* Hero CTA */}
        <div className="mt-8 rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950/60 p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5">
                  MVP
                </span>
                <span>Upload once, schedule everywhere</span>
              </div>

              <div className="mt-3 text-xl md:text-2xl font-semibold tracking-tight">
                Get a clip ready in seconds.
              </div>
              <div className="mt-1 text-sm text-slate-400">
                Upload your video, then schedule it — or save it as a draft for later.
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                href="/upload"
                className="rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
              >
                Upload now
              </Link>
              <Link
                href="/uploads"
                className="rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-3 text-sm hover:bg-slate-900"
              >
                View drafts
              </Link>
            </div>
          </div>
        </div>

        {/* Connected accounts */}
        <Section
          title="Connected accounts"
          subtitle="Connect once — then uploads and schedules run automatically."
          right={
            <div className="flex items-center gap-2">
              <Pill variant="neutral">
                {accountsLoading ? "…" : `${accounts.length} connected`}
              </Pill>

              <button
                onClick={() => accessToken && loadPlatformAccounts(accessToken)}
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm hover:bg-slate-900"
              >
                Refresh
              </button>

              <Link
                href="/settings"
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm hover:bg-slate-900"
              >
                Settings
              </Link>
            </div>
          }
        >
          {accountsLoading ? (
            <EmptyState title="Loading…" desc="Fetching your connected accounts." />
          ) : accountsError ? (
            <div className="px-5 py-5">
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {accountsError}
              </div>
            </div>
          ) : (
            <div className="px-5 py-6">
              {/* Connected */}
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-200">Connected</div>
                <Pill variant="connected">{connectedProviders.length}</Pill>
              </div>

              {connectedProviders.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="text-sm font-medium text-slate-200">
                    No accounts connected yet
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    Connect YouTube to start uploading for real.
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={() => (window.location.href = "/api/auth/youtube/start")}
                      className="inline-flex rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                    >
                      Connect YouTube
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {accounts.map((a) => (
                    <div
                      key={a.provider}
                      className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-slate-100">
                              {prettyProvider(a.provider)}
                            </div>
                            <Pill variant="connected">Connected</Pill>
                          </div>
                          <div className="mt-1 text-sm text-slate-400">
                            Ready for uploads and scheduling.
                          </div>
                        </div>

                        <Link
                          href="/settings"
                          className="shrink-0 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm hover:bg-slate-900"
                        >
                          Manage
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Available */}
              <div className="mt-6 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-200">Available</div>
                <Pill variant="neutral">{availableProviders.length}</Pill>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {availableProviders.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-slate-100">{p.name}</div>
                          {p.badge ? (
                            <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[11px] text-slate-300">
                              {p.badge}
                            </span>
                          ) : null}
                          {!p.availableNow ? <Pill variant="soon">Coming soon</Pill> : null}
                        </div>
                        <div className="mt-1 text-sm text-slate-400">{p.desc}</div>
                      </div>

                      {p.id === "youtube" ? (
                        <button
                          onClick={() => (window.location.href = "/api/auth/youtube/start")}
                          className="shrink-0 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                        >
                          Connect
                        </button>
                      ) : (
                        <button
                          disabled
                          className="shrink-0 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-2 text-sm text-slate-400 cursor-not-allowed"
                        >
                          Coming soon
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Upcoming */}
        <Section
          title="Upcoming scheduled"
          subtitle="Posts scheduled for the future."
          right={
            <Pill variant="scheduled">
              {loading ? "…" : `${upcoming.length} upcoming`}
            </Pill>
          }
        >
          {loading ? (
            <EmptyState title="Loading…" desc="Fetching your scheduled posts." />
          ) : upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming scheduled posts"
              desc="Upload a clip and schedule it to see it here."
              action={
                <Link
                  href="/upload"
                  className="inline-flex rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                >
                  + Upload
                </Link>
              }
            />
          ) : (
            <div>
              {upcoming.map((p) => (
                <Row key={p.id} p={p} variant="scheduled" />
              ))}
            </div>
          )}
        </Section>

        {/* Recently posted */}
        <Section
          title="Recently posted"
          subtitle="Successful worker runs (last 12)."
          right={
            <Pill variant="posted">
              {loading ? "…" : `${recentPosted.length} recent`}
            </Pill>
          }
        >
          {loading ? (
            <EmptyState title="Loading…" desc="Fetching recent successful posts." />
          ) : recentPosted.length === 0 ? (
            <EmptyState
              title="Nothing posted yet"
              desc="Once your worker processes a scheduled post, it will appear here."
            />
          ) : (
            <div>
              {recentPosted.map((p) => (
                <Row key={p.id} p={p} variant="posted" />
              ))}
            </div>
          )}
        </Section>

        <div className="mt-8 text-xs text-slate-500">
          Note: “Posted” currently means the worker processed the job successfully.
          Real YouTube/TikTok/IG upload adapters come next.
        </div>
      </div>
    </div>
  );
}
