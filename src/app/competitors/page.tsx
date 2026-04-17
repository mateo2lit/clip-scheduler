"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Competitor = {
  id: string;
  platform: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  post_count: number;
  last_fetched_at: string | null;
  growth7d: number | null;
  growth30d: number | null;
  history: { follower_count: number; post_count: number; snapshot_date: string }[];
};

type OwnStats = Record<string, { current: number; weekAgo: number | null }>;

const SUPPORTED_AUTO = ["youtube", "bluesky"];

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#ef4444",
  tiktok: "#d946ef",
  instagram: "#ec4899",
  facebook: "#3b82f6",
  bluesky: "#38bdf8",
  x: "#a3a3a3",
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  bluesky: "Bluesky",
  x: "X",
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function formatDelta(n: number | null): { label: string; positive: boolean; neutral: boolean } {
  if (n === null) return { label: "—", positive: false, neutral: true };
  if (n === 0) return { label: "0", positive: false, neutral: true };
  const sign = n > 0 ? "+" : "";
  return { label: `${sign}${formatNum(n)}`, positive: n > 0, neutral: false };
}

export default function CompetitorsPage() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [ownStats, setOwnStats] = useState<OwnStats>({});
  const [loading, setLoading] = useState(true);

  // Add form
  const [addPlatform, setAddPlatform] = useState("youtube");
  const [addHandle, setAddHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    async function boot() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }
      setAuthToken(auth.session.access_token);
      await loadCompetitors(auth.session.access_token);
    }
    boot();
  }, []);

  async function loadCompetitors(token: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/competitors", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok) {
        setCompetitors(json.competitors || []);
        setOwnStats(json.ownStats || {});
      }
    } catch {}
    setLoading(false);
  }

  async function handleAdd() {
    if (!authToken || !addHandle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ platform: addPlatform, handle: addHandle.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        setAddHandle("");
        await loadCompetitors(authToken);
      } else {
        alert(json.error || "Failed to add competitor");
      }
    } catch {
      alert("Failed to add competitor");
    }
    setAdding(false);
  }

  async function handleRemove(id: string) {
    if (!authToken) return;
    if (!confirm("Remove this competitor?")) return;
    await fetch(`/api/competitors?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    setCompetitors((prev) => prev.filter((c) => c.id !== id));
  }

  const isAutoSupported = SUPPORTED_AUTO.includes(addPlatform);

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" />
          </Link>
          <Link href="/dashboard" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            Dashboard
          </Link>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-10 pb-16">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-white/30 hover:text-white/60 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Competitors</h1>
              <p className="text-sm text-white/40 mt-0.5">
                Track who&apos;s growing faster than you and learn why
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1.5 mt-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
            {showHelp ? "Hide help" : "How this works"}
          </button>
        </div>

        {/* Help panel */}
        {showHelp && (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-5 mb-6">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">What is this for?</h3>
            <ul className="space-y-1.5 text-sm text-white/60">
              <li>• See how your follower growth compares to similar creators</li>
              <li>• Spot who&apos;s accelerating — study their content to learn what&apos;s working</li>
              <li>• Track up to 10 competitors per team</li>
            </ul>
            <h3 className="text-sm font-semibold text-blue-300 mt-4 mb-2">What&apos;s tracked?</h3>
            <ul className="space-y-1.5 text-sm text-white/60">
              <li>
                • <span className="text-white/80 font-medium">Auto-tracked</span>: YouTube, Bluesky —
                we fetch their public stats daily
              </li>
              <li>
                • <span className="text-white/80 font-medium">Manual only</span>: TikTok, Instagram,
                Facebook, X — these platforms don&apos;t expose public data without OAuth
              </li>
            </ul>
            <p className="text-xs text-white/40 mt-4">
              Data refreshes once per day via background cron. New competitors show data within 24
              hours.
            </p>
          </div>
        )}

        {/* Add competitor */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-8">
          <h3 className="text-sm font-semibold text-white/70 mb-3">Add a competitor</h3>
          <div className="flex gap-3">
            <select
              value={addPlatform}
              onChange={(e) => setAddPlatform(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-300/40"
            >
              {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
                <option key={key} value={key} className="bg-neutral-900">
                  {label}
                  {SUPPORTED_AUTO.includes(key) ? "" : " (manual)"}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={addHandle}
              onChange={(e) => setAddHandle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={addPlatform === "youtube" ? "@MrBeast or MrBeast" : addPlatform === "bluesky" ? "handle.bsky.social" : "username"}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !addHandle.trim()}
              className="rounded-xl bg-blue-500/20 px-5 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-500/30 disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
          {!isAutoSupported && (
            <p className="text-xs text-yellow-400/70 mt-2 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {PLATFORM_LABELS[addPlatform]} doesn&apos;t allow public data lookup. You can still track them but numbers won&apos;t auto-update.
            </p>
          )}
        </div>

        {/* Competitor list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : competitors.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
            <svg className="w-12 h-12 mx-auto mb-4 text-white/15" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <p className="text-white/40">No competitors tracked yet</p>
            <p className="text-sm text-white/25 mt-1 max-w-md mx-auto">
              Add 2-3 creators in your niche to see how your growth compares. We recommend picking
              one creator slightly bigger than you and one much bigger.
            </p>
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="hidden md:grid grid-cols-[1fr_100px_100px_120px_160px_40px] gap-4 px-5 pb-2 text-[10px] uppercase tracking-wider font-semibold text-white/25">
              <span>Creator</span>
              <span className="text-right">Followers</span>
              <span className="text-right">7-day growth</span>
              <span className="text-right">vs Your {PLATFORM_LABELS[competitors[0]?.platform] || ""}</span>
              <span className="text-right">30-day trend</span>
              <span></span>
            </div>

            <div className="space-y-2">
              {competitors.map((comp) => {
                const chartData = comp.history.map((h) => ({
                  date: new Date(h.snapshot_date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                  followers: h.follower_count,
                }));

                const delta7d = formatDelta(comp.growth7d);
                const color = PLATFORM_COLORS[comp.platform] || "#6b7280";

                // Compare to user's own stats on same platform
                const own = ownStats[comp.platform];
                const diff = own && own.current > 0 ? comp.follower_count - own.current : null;
                const ratio = own && own.current > 0 ? comp.follower_count / own.current : null;

                const isAuto = SUPPORTED_AUTO.includes(comp.platform);

                return (
                  <div
                    key={comp.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 md:grid md:grid-cols-[1fr_100px_100px_120px_160px_40px] md:gap-4 md:items-center flex flex-col gap-3"
                  >
                    {/* Creator info */}
                    <div className="flex items-center gap-3 min-w-0">
                      {comp.avatar_url ? (
                        <img
                          src={comp.avatar_url}
                          alt={comp.display_name}
                          className="w-10 h-10 rounded-xl object-cover bg-white/[0.04] shrink-0"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                          style={{ background: color + "20", color }}
                        >
                          {comp.display_name?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{comp.display_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: color + "20", color }}
                          >
                            {PLATFORM_LABELS[comp.platform]}
                          </span>
                          <span className="text-xs text-white/30 truncate">@{comp.handle}</span>
                          {!isAuto && (
                            <span className="text-[9px] text-yellow-400/50">(manual)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Followers */}
                    <div className="md:text-right">
                      <p className="text-base font-bold text-white tabular-nums">
                        {formatNum(comp.follower_count)}
                      </p>
                      <p className="md:hidden text-[10px] text-white/30">followers</p>
                    </div>

                    {/* 7-day growth */}
                    <div className="md:text-right">
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          delta7d.neutral
                            ? "text-white/30"
                            : delta7d.positive
                              ? "text-emerald-400"
                              : "text-red-400"
                        }`}
                      >
                        {delta7d.label}
                      </p>
                      <p className="md:hidden text-[10px] text-white/30">7d change</p>
                    </div>

                    {/* vs Your stats */}
                    <div className="md:text-right">
                      {ratio !== null ? (
                        <>
                          <p className="text-xs text-white/50 tabular-nums">
                            {ratio >= 1
                              ? `${ratio.toFixed(1)}x your size`
                              : `${Math.round(ratio * 100)}% of yours`}
                          </p>
                          {diff !== null && (
                            <p className="text-[10px] text-white/25 tabular-nums">
                              {diff > 0 ? `+${formatNum(diff)} ahead` : `${formatNum(Math.abs(diff))} behind`}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[10px] text-white/25">No data yet</p>
                      )}
                    </div>

                    {/* Sparkline */}
                    <div className="h-[50px] w-full md:w-[160px]">
                      {chartData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <Tooltip
                              content={({ active, payload }: any) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div className="rounded-lg border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-sm px-2.5 py-1.5 shadow-xl">
                                    <p className="text-[10px] text-white/50">{payload[0].payload.date}</p>
                                    <p className="text-xs font-semibold text-white tabular-nums">
                                      {formatNum(payload[0].value)}
                                    </p>
                                  </div>
                                );
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="followers"
                              stroke={color}
                              strokeWidth={1.5}
                              dot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          <p className="text-[10px] text-white/25">Collecting data...</p>
                        </div>
                      )}
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => handleRemove(comp.id)}
                      className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors md:justify-self-end self-start"
                      title="Remove competitor"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Info footer */}
            <div className="mt-6 px-1 text-xs text-white/25">
              Data refreshes daily at 6 AM UTC. Growth metrics need 7+ days of snapshots to appear.
            </div>
          </>
        )}
      </div>
    </main>
  );
}
