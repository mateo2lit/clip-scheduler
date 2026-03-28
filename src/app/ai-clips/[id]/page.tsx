"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";
import AppPageOrb from "@/components/AppPageOrb";
import { SubtitleStyle, DEFAULT_SUBTITLE_STYLE, PRESETS, PRESET_LABELS, PresetKey } from "@/app/ai-clips/types";
import { SubtitleStylePicker } from "@/components/ai-clips/SubtitleStylePicker";
import { ClipCard } from "@/components/ai-clips/ClipCard";

type AiClipJobStatus =
  | "pending" | "uploading" | "transcribing" | "detecting" | "cutting" | "done" | "failed";

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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:      { label: "Queued",                color: "from-blue-500 to-purple-500" },
  uploading:    { label: "Downloading video…",    color: "from-blue-500 to-purple-500" },
  transcribing: { label: "Transcribing audio…",   color: "from-blue-500 to-purple-500" },
  detecting:    { label: "Finding best moments…", color: "from-violet-500 to-purple-500" },
  cutting:      { label: "Cutting clips…",        color: "from-blue-500 to-purple-500" },
  done:         { label: "Done",                  color: "from-emerald-400 to-teal-400" },
  failed:       { label: "Failed",                color: "from-red-500 to-rose-500" },
};

function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

// ── Subtitle quick bar ───────────────────────────────────────────────────────

function SubtitleQuickBar({
  style,
  onChange,
  expanded,
  onToggleExpand,
}: {
  style: SubtitleStyle;
  onChange: (s: SubtitleStyle) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const presets = Object.keys(PRESETS) as PresetKey[];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      {/* Top row: presets + size + expand */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-white/40 uppercase tracking-wider flex-shrink-0">Captions</span>

        {/* Preset pills */}
        <div className="flex gap-1.5 flex-wrap">
          {presets.map((key) => {
            const isActive = style.preset === key || (key === "none" && style.animation === "none");
            return (
              <button
                key={key}
                onClick={() => onChange({ ...PRESETS[key] })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                  isActive
                    ? "bg-white text-black border-white"
                    : "bg-white/5 text-white/50 border-white/10 hover:border-white/25 hover:text-white/70"
                }`}
              >
                {PRESET_LABELS[key]}
              </button>
            );
          })}
        </div>

        {/* Font size slider — always visible */}
        {style.animation !== "none" && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[11px] text-white/30 flex-shrink-0">Size</span>
            <input
              type="range"
              min={20}
              max={80}
              value={style.fontSize}
              onChange={(e) =>
                onChange({ ...style, fontSize: Number(e.target.value), preset: "custom" })
              }
              className="w-28 accent-violet-400"
            />
            <span className="text-[11px] text-white/40 w-5 tabular-nums">{style.fontSize}</span>
          </div>
        )}

        <button
          onClick={onToggleExpand}
          className="flex-shrink-0 text-[11px] text-white/30 hover:text-white/60 transition-colors ml-1"
        >
          {expanded ? "Less ▲" : "More ▼"}
        </button>
      </div>

      {/* Expanded full picker */}
      {expanded && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <SubtitleStylePicker style={style} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AiClipProjectPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [job, setJob] = useState<AiClipJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const [expandedCaption, setExpandedCaption] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) { window.location.href = "/login"; return; }
      if (cancelled) return;

      setSessionEmail(auth.session.user.email ?? null);
      const token = auth.session.access_token;
      setAuthToken(token);

      try {
        const res = await fetch(`/api/ai-clips/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!json.ok) { setError(json.error || "Job not found."); setLoading(false); return; }
        if (cancelled) return;
        setJob(json.job);
        setLoading(false);

        const s = json.job?.status;
        if (s && s !== "done" && s !== "failed") startPolling(token);
      } catch {
        setError("Failed to load project.");
        setLoading(false);
      }
    }

    boot();
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  function startPolling(token: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    const startTime = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - startTime > 20 * 60 * 1000) { clearInterval(pollRef.current!); return; }
      try {
        const res = await fetch(`/api/ai-clips/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (json.ok && json.job) {
          setJob(json.job);
          if (json.job.status === "done" || json.job.status === "failed") clearInterval(pollRef.current!);
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
        <Link href="/ai-clips" className="text-violet-400 hover:text-violet-300 text-sm">← Back to AI Clips</Link>
      </main>
    );
  }

  const statusCfg = STATUS_CONFIG[job.status];
  const isProcessing = job.status !== "done" && job.status !== "failed";

  return (
    <main className="min-h-screen bg-[#050505] text-white relative">
      <AppPageOrb />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/ai-clips"
              className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Projects
            </Link>
            <span className="text-white/15">/</span>
            <span className="text-sm text-white/60">
              {job.clips_generated
                ? `${job.clips_generated} clips`
                : isProcessing ? "Processing…" : "Project"}
            </span>
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

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-8 pb-16 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-300">
                ✨ AI Clips
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-medium border ${
                job.status === "done"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : job.status === "failed"
                  ? "border-red-500/30 bg-red-500/10 text-red-400"
                  : "border-violet-400/30 bg-violet-400/10 text-violet-300 animate-pulse"
              }`}>
                {statusCfg?.label || job.status}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-white">
              {job.clips_generated
                ? `${job.clips_generated} clip${job.clips_generated !== 1 ? "s" : ""} ready`
                : isProcessing ? "Generating clips…" : "Project"}
            </h1>
            {job.source_duration_minutes > 0 && (
              <p className="text-sm text-white/30 mt-1">
                {formatMinutes(job.source_duration_minutes)} source ·{" "}
                {new Date(job.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
        </div>

        {/* Processing progress */}
        {isProcessing && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">{statusCfg?.label}</p>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full bg-gradient-to-r ${statusCfg?.color} animate-pulse`} style={{ width: "60%" }} />
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              {(["uploading", "transcribing", "detecting", "cutting"] as const).map((s) => {
                const order = ["uploading", "transcribing", "detecting", "cutting"];
                const done = order.indexOf(s) < order.indexOf(job.status as any);
                const active = s === job.status;
                return (
                  <span key={s} className={`rounded-full px-3 py-1 text-[11px] font-medium border ${
                    done ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : active ? "border-violet-400/40 bg-violet-400/10 text-violet-300"
                    : "border-white/10 text-white/20"
                  }`}>
                    {done ? "✓ " : ""}{STATUS_CONFIG[s]?.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Failed */}
        {job.status === "failed" && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4">
            <p className="text-sm text-red-400">{job.error || "This job failed. Please try again from the AI Clips page."}</p>
            <Link href="/ai-clips" className="text-xs text-red-300 hover:text-red-200 transition-colors mt-2 inline-block">
              ← Back to AI Clips
            </Link>
          </div>
        )}

        {/* Clips */}
        {job.status === "done" && job.result_upload_ids && authToken && (
          <>
            {/* Subtitle quick controls */}
            <SubtitleQuickBar
              style={subtitleStyle}
              onChange={setSubtitleStyle}
              expanded={expandedCaption}
              onToggleExpand={() => setExpandedCaption((v) => !v)}
            />

            {/* Horizontal scroll area */}
            <div className="relative">
              {/* Scroll hint gradient edges */}
              <div className="absolute left-0 top-0 bottom-4 w-8 bg-gradient-to-r from-[#050505] to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-4 w-8 bg-gradient-to-l from-[#050505] to-transparent z-10 pointer-events-none" />

              <div className="flex gap-5 overflow-x-auto pb-4 scroll-smooth" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
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
                {/* Spacer at end for scroll */}
                <div className="flex-shrink-0 w-2" />
              </div>
            </div>

            <p className="text-xs text-white/20 text-center">
              Scroll to see all {job.clips_generated} clips · Click a clip to play · "Post" schedules to your connected accounts
            </p>
          </>
        )}
      </div>
    </main>
  );
}
