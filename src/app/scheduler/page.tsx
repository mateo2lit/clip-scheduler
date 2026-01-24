// src/app/scheduler/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../login/supabaseClient";

type ScheduledRow = {
  id: string;
  user_id?: string | null;
  platform: string;
  title: string;
  description?: string | null;
  tags?: any;
  asset_url: string;
  scheduled_for: string;
  status: string;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
};

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function SchedulerPage() {
  const [rows, setRows] = useState<ScheduledRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningWorker, setRunningWorker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showPosted, setShowPosted] = useState(true);
  const [showFailed, setShowFailed] = useState(true);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!showPosted && r.status === "posted") return false;
      if (!showFailed && r.status === "failed") return false;
      return true;
    });
  }, [rows, showPosted, showFailed]);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not logged in. Go to /login first.");

      const res = await fetch("/api/scheduled-posts", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Failed to load scheduled posts (${res.status})`);
      }

      setRows((json.data ?? []) as ScheduledRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load scheduled posts.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const runWorker = async () => {
    setError(null);
    setRunningWorker(true);
    try {
      const res = await fetch("/api/cron/run-worker", {
        method: "GET",
        cache: "no-store",
        headers: process.env.NEXT_PUBLIC_CRON_SECRET
          ? { "x-cron-secret": process.env.NEXT_PUBLIC_CRON_SECRET }
          : undefined,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Worker failed (${res.status})`);
      }

      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to run worker.");
    } finally {
      setRunningWorker(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Scheduler</h1>
            <p className="text-sm text-slate-300 mt-1">
              This page shows your scheduled posts AND posted history (toggle below).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/[0.10] disabled:opacity-60"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <button
              onClick={runWorker}
              disabled={runningWorker}
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {runningWorker ? "Running worker..." : "Run worker"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-slate-200">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showPosted}
              onChange={(e) => setShowPosted(e.target.checked)}
            />
            Show posted
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showFailed}
              onChange={(e) => setShowFailed(e.target.checked)}
            />
            Show failed
          </label>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Scheduled posts</h2>
            <div className="text-xs text-slate-300">
              Total: {rows.length} • Showing: {filtered.length}
            </div>
          </div>

          {loading ? (
            <div className="p-4 text-sm text-slate-300">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-slate-300">
              No scheduled posts to show (try enabling “Show posted”).
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-300">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Scheduled for</th>
                    <th className="px-4 py-3">Asset URL</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 align-top">
                      <td className="px-4 py-3">
                        <span
                          className={[
                            "inline-flex rounded-full px-2 py-1 text-xs border",
                            r.status === "posted"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                              : r.status === "failed"
                              ? "border-red-500/30 bg-red-500/10 text-red-200"
                              : r.status === "processing"
                              ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"
                              : "border-white/10 bg-white/[0.06] text-slate-200",
                          ].join(" ")}
                        >
                          {r.status}
                        </span>
                        {r.error ? (
                          <div className="mt-2 text-xs text-red-200/90 break-words">
                            {r.error}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-3 text-slate-200">{r.platform}</td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{r.title}</div>
                        {r.description ? (
                          <div className="text-xs text-slate-300 mt-1 break-words">
                            {r.description}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-3 text-slate-200">
                        {new Date(r.scheduled_for).toLocaleString()}
                      </td>

                      <td className="px-4 py-3">
                        <a
                          href={r.asset_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-300 hover:text-blue-200 break-all"
                        >
                          {r.asset_url}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Note: “posted” currently means the worker processed the job successfully. Actual
          platform uploading is still stubbed until we add YouTube/TikTok/IG adapters.
        </p>
      </div>
    </main>
  );
}
