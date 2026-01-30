"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type ScheduledPostRow = {
  id: string;
  upload_id: string | null;
  title: string | null;
  description: string | null;
  privacy_status: string | null;
  scheduled_for: string;
  platforms: any;
  status: string | null;
  last_error?: string | null;
  created_at?: string | null;
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

export default function SchedulerPage() {
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPostRow[]>([]);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

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

      setSessionEmail(auth.session.user.email ?? null);

      const res = await supabase
        .from("scheduled_posts")
        .select("id, upload_id, title, description, privacy_status, scheduled_for, platforms, status, last_error, created_at")
        .order("scheduled_for", { ascending: true })
        .limit(50);

      if (cancelled) return;

      setRows(res.data ?? []);
      setLoading(false);
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runWorkerNow() {
    try {
      setRunning(true);
      setRunMsg(null);

      // We call your NEW worker endpoint.
      // NOTE: In production, this endpoint is protected by x-worker-secret.
      // From the browser we cannot safely include secrets.
      // So this "Run worker" button is meant for LOCAL dev unless you also add a
      // server-side proxy endpoint for admins.
      const res = await fetch("/api/worker/run-scheduled", { method: "POST" });

      const text = await res.text();
      setRunMsg(`HTTP ${res.status}: ${text}`);
    } catch (e: any) {
      setRunMsg(e?.message ?? "Failed to run worker");
    } finally {
      setRunning(false);
    }
  }

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, [now]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-slate-400">{greeting}</div>
            <h1 className="text-2xl font-semibold tracking-tight">Scheduler</h1>
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

            <button
              onClick={runWorkerNow}
              disabled={running}
              className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
              title="Runs the worker locally. In production, call this from Supabase cron or server-side."
            >
              {running ? "Running…" : "Run worker now"}
            </button>
          </div>
        </div>

        {runMsg ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-200 whitespace-pre-wrap">
            {runMsg}
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60">
          {loading ? (
            <div className="px-5 py-6 text-sm text-slate-300">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-6">
              <div className="text-sm font-medium text-slate-200">No scheduled posts yet</div>
              <div className="text-sm text-slate-400 mt-1">
                Upload a video, then schedule it to see it here.
              </div>
              <div className="mt-4">
                <Link
                  href="/upload"
                  className="inline-flex rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                >
                  + Upload
                </Link>
              </div>
            </div>
          ) : (
            <div>
              {rows.map((p) => {
                const platforms = normalizePlatforms(p.platforms);
                return (
                  <div
                    key={p.id}
                    className="px-5 py-4 flex items-start justify-between gap-4 border-t border-slate-800 first:border-t-0"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-100 truncate">
                        {p.title || "Untitled"}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        Scheduled: <span className="text-slate-200">{fmtWhen(p.scheduled_for)}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Platforms:{" "}
                        <span className="text-slate-300">
                          {platforms.length ? platforms.join(", ") : "—"}
                        </span>
                      </div>
                      {p.last_error ? (
                        <div className="mt-2 text-xs text-red-300 whitespace-pre-wrap">
                          Error: {p.last_error}
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-xs text-slate-400">
                      <span className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1">
                        {p.status ?? "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-slate-500">
          Note: In production, the worker endpoint is protected by <code>x-worker-secret</code>.
          Your scheduler button is mainly for local testing — production runs should come from Supabase cron
          (or a server-side admin trigger).
        </div>
      </div>
    </div>
  );
}
