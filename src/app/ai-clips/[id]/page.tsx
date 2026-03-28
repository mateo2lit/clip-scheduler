"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";
import AppPageOrb from "@/components/AppPageOrb";
import { SubtitleStyle, DEFAULT_SUBTITLE_STYLE } from "@/app/ai-clips/types";
import { SubtitleStylePicker } from "@/components/ai-clips/SubtitleStylePicker";
import { ClipCard } from "@/components/ai-clips/ClipCard";

type AiClipJobStatus =
  | "pending"
  | "uploading"
  | "transcribing"
  | "detecting"
  | "cutting"
  | "done"
  | "failed";

type AiClipJob = {
  id: string;
  clip_count: number;
  source_duration_minutes: number;
  status: AiClipJobStatus;
  clips_generated: number | null;
  result_upload_ids: string[] | null;
  result_titles: string[] | null;
  result_subtitles: any[] | null;
  error: string | null;
  created_at: string;
};

function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export default function AiClipProjectPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [job, setJob] = useState<AiClipJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const [showSubtitleConfig, setShowSubtitleConfig] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    pending:      { label: "Queued",                color: "from-blue-500 to-purple-500" },
    uploading:    { label: "Uploading video…",      color: "from-blue-500 to-purple-500" },
    transcribing: { label: "Transcribing audio…",   color: "from-blue-500 to-purple-500" },
    detecting:    { label: "Finding best moments…", color: "from-violet-500 to-purple-500" },
    cutting:      { label: "Cutting clips…",        color: "from-blue-500 to-purple-500" },
    done:         { label: "Done",                  color: "from-emerald-400 to-teal-400" },
    failed:       { label: "Failed",                color: "from-red-500 to-rose-500" },
  };

  useEffect(() => {
    async function boot() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        router.push("/login");
        return;
      }
      setSessionEmail(auth.session.user.email ?? null);
      const token = auth.session.access_token;
      setAuthToken(token);

      await fetchJob(token);
    }
    boot();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  const fetchJob = useCallback(async (token: string) => {
    try {
      const res = await fetch(`/api/ai-clips/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Job not found.");
        setLoading(false);
        return;
      }
      setJob(json.job);
      setLoading(false);

      // If still in progress, start polling
      const s = json.job?.status;
      if (s && s !== "done" && s !== "failed") {
        startPolling(token);
      }
    } catch {
      setError("Failed to load project.");
      setLoading(false);
    }
  }, [jobId]);

  function startPolling(token: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    const startTime = Date.now();

    pollRef.current = setInterval(async () => {
      if (Date.now() - startTime > 20 * 60 * 1000) {
        clearInterval(pollRef.current!);
        return;
      }
      try {
        const res = await fetch(`/api/ai-clips/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.ok && json.job) {
          setJob(json.job);
          if (json.job.status === "done" || json.job.status === "failed") {
            clearInterval(pollRef.current!);
          }
        }
      } catch {}
    }, 2500);
  }

  function handleScheduled(uploadId: string, title: string) {
    window.location.href = `/uploads?uploadId=${encodeURIComponent(uploadId)}&title=${encodeURIComponent(title)}`;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error || "Project not found."}</p>
        <Link href="/ai-clips" className="text-violet-400 hover:text-violet-300 text-sm">
          ← Back to AI Clips
        </Link>
      </main>
    );
  }

  const statusCfg = STATUS_CONFIG[job.status];
  const isProcessing = job.status !== "done" && job.status !== "failed";

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <AppPageOrb />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/ai-clips" className="text-sm text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              AI Clips
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-sm text-white/70">Project</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-white/40 hover:text-white/70 transition-colors">Dashboard</Link>
            <Link href="/uploads" className="text-sm text-white/40 hover:text-white/70 transition-colors">Upload</Link>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-5xl px-6 pt-8 pb-16 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-300">
                ✨ AI Clips
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium border ${
                  job.status === "done"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : job.status === "failed"
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-violet-400/30 bg-violet-400/10 text-violet-300"
                }`}
              >
                {statusCfg?.label || job.status}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-white">
              {job.clips_generated
                ? `${job.clips_generated} clip${job.clips_generated !== 1 ? "s" : ""} generated`
                : isProcessing
                ? "Processing…"
                : "Project"}
            </h1>
            <p className="text-sm text-white/40 mt-1">
              {formatMinutes(job.source_duration_minutes)} source · {new Date(job.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>

        {/* Progress (if still running) */}
        {isProcessing && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">{statusCfg?.label || job.status}</p>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${statusCfg?.color} animate-pulse`}
                style={{ width: "60%" }}
              />
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              {(["uploading", "transcribing", "detecting", "cutting"] as const).map((s) => {
                const stageOrder = ["uploading", "transcribing", "detecting", "cutting"];
                const idx = stageOrder.indexOf(s);
                const activeIdx = stageOrder.indexOf(job.status as any);
                const done = idx < activeIdx;
                const active = s === job.status;
                return (
                  <span
                    key={s}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium border ${
                      done
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : active
                        ? "border-violet-400/40 bg-violet-400/10 text-violet-300"
                        : "border-white/10 bg-transparent text-white/20"
                    }`}
                  >
                    {done ? "✓ " : ""}
                    {STATUS_CONFIG[s]?.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Failed state */}
        {job.status === "failed" && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4">
            <p className="text-sm text-red-400">{job.error || "This job failed. Please try again from the AI Clips page."}</p>
          </div>
        )}

        {/* Clips grid */}
        {job.status === "done" && job.result_upload_ids && authToken && (
          <>
            {/* Subtitle style picker */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <button
                onClick={() => setShowSubtitleConfig((v) => !v)}
                className="flex items-center gap-2 text-sm text-white/60 hover:text-white/80 transition-colors w-full"
              >
                <span>Subtitle style</span>
                <span className="ml-1 text-xs text-white/30 font-normal">
                  ({subtitleStyle.animation === "none" ? "Off" : subtitleStyle.animation === "word_highlight" ? "Word Highlight" : "Line by Line"})
                </span>
                <span className="ml-auto text-white/30">{showSubtitleConfig ? "▲" : "▼"}</span>
              </button>
              {showSubtitleConfig && (
                <div className="mt-4">
                  <SubtitleStylePicker style={subtitleStyle} onChange={setSubtitleStyle} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {job.result_upload_ids.map((uploadId, i) => (
                <ClipCard
                  key={uploadId}
                  index={i}
                  uploadId={uploadId}
                  title={job.result_titles?.[i] ?? `Clip ${i + 1}`}
                  subtitleWords={job.result_subtitles?.[i] ?? []}
                  subtitleStyle={subtitleStyle}
                  jobId={job.id}
                  token={authToken}
                  onScheduled={handleScheduled}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
