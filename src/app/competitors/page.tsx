"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";
import AppPageOrb from "@/components/AppPageOrb";
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
  history: { follower_count: number; post_count: number; snapshot_date: string }[];
};

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

export default function CompetitorsPage() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [addPlatform, setAddPlatform] = useState("youtube");
  const [addHandle, setAddHandle] = useState("");
  const [adding, setAdding] = useState(false);

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
      if (json.ok) setCompetitors(json.competitors || []);
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
    await fetch(`/api/competitors?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    setCompetitors((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <AppPageOrb />

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
        <div className="flex items-center gap-3 mb-8">
          <Link href="/dashboard" className="text-white/30 hover:text-white/60 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold">Competitor Benchmarking</h1>
        </div>

        {/* Add competitor */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-8">
          <h3 className="text-sm font-semibold text-white/70 mb-4">Track a Competitor</h3>
          <div className="flex gap-3">
            <select
              value={addPlatform}
              onChange={(e) => setAddPlatform(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-300/40"
            >
              {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
                <option key={key} value={key} className="bg-neutral-900">
                  {label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={addHandle}
              onChange={(e) => setAddHandle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Username or handle"
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
          <p className="text-xs text-white/25 mt-2">
            Currently supports automatic data for YouTube and Bluesky. Other platforms can be tracked manually.
          </p>
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
            <p className="text-sm text-white/25 mt-1">Add a competitor above to start benchmarking</p>
          </div>
        ) : (
          <div className="space-y-4">
            {competitors.map((comp) => {
              const chartData = comp.history.map((h) => ({
                date: new Date(h.snapshot_date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                followers: h.follower_count,
              }));

              return (
                <div
                  key={comp.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    {comp.avatar_url ? (
                      <img
                        src={comp.avatar_url}
                        alt={comp.display_name}
                        className="w-12 h-12 rounded-xl object-cover bg-white/[0.04]"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
                        style={{
                          background: (PLATFORM_COLORS[comp.platform] || "#6b7280") + "20",
                          color: PLATFORM_COLORS[comp.platform] || "#6b7280",
                        }}
                      >
                        {comp.display_name?.[0]?.toUpperCase() || "?"}
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">{comp.display_name}</h3>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background: (PLATFORM_COLORS[comp.platform] || "#6b7280") + "20",
                            color: PLATFORM_COLORS[comp.platform] || "#6b7280",
                          }}
                        >
                          {PLATFORM_LABELS[comp.platform]}
                        </span>
                      </div>
                      <p className="text-xs text-white/35 mt-0.5">@{comp.handle}</p>

                      {/* Stats */}
                      <div className="flex gap-6 mt-3">
                        <div>
                          <p className="text-lg font-bold text-white tabular-nums">{formatNum(comp.follower_count)}</p>
                          <p className="text-[10px] text-white/30 uppercase tracking-wider">Followers</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-white tabular-nums">{formatNum(comp.post_count)}</p>
                          <p className="text-[10px] text-white/30 uppercase tracking-wider">Posts</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-white tabular-nums">{formatNum(comp.following_count)}</p>
                          <p className="text-[10px] text-white/30 uppercase tracking-wider">Following</p>
                        </div>
                      </div>
                    </div>

                    {/* Mini chart */}
                    {chartData.length > 1 && (
                      <div className="w-[160px] h-[60px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <Line
                              type="monotone"
                              dataKey="followers"
                              stroke={PLATFORM_COLORS[comp.platform] || "#6b7280"}
                              strokeWidth={1.5}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Remove */}
                    <button
                      onClick={() => handleRemove(comp.id)}
                      className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                      title="Remove competitor"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
