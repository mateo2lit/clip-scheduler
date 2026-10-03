"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";
import { RENDER_WHY, UPLOAD_INSTEAD, isDownloadFailure } from "@/app/ai-clips/waitCopy";
import {
  SubtitleStyle, DEFAULT_SUBTITLE_STYLE, PRESETS, PRESET_LABELS, PresetKey,
  type ConvertMode, CONVERT_MODE_OPTIONS,
} from "@/app/ai-clips/types";
import { SubtitleStylePicker } from "@/components/ai-clips/SubtitleStylePicker";
import { ClipCard, viralityTier, type DownloadInfo } from "@/components/ai-clips/ClipCard";
import { CaretLeft, CaretRight, X as XIcon } from "@phosphor-icons/react/dist/ssr";
import type { FinishProgress } from "@/lib/aiClips/finishLargeJob";

type AiClipJobStatus =
  | "pending" | "uploading" | "transcribing" | "detecting" | "cutting" | "done" | "failed";

type MomentResult = {
  index: number;
  start_sec: number;
  end_sec: number;
  title?: string;
  hook_title?: string;
  score?: number;
  reason?: string;
};

type AiClipJob = {
  id: string;
  team_id?: string;
  clip_count: number;
  source_duration_minutes: number;
  status: AiClipJobStatus;
  processing_path?: "small" | "large";
  clips_generated: number | null;
  result_upload_ids: string[] | null;
  result_titles: string[] | null;
  result_subtitles: any[] | null;
  result_moments_json?: MomentResult[] | null;
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
  convertMode,
  onConvertMode,
  expanded,
  onToggleExpand,
}: {
  style: SubtitleStyle;
  onChange: (s: SubtitleStyle) => void;
  convertMode: ConvertMode;
  onConvertMode: (m: ConvertMode) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const presets = Object.keys(PRESETS) as PresetKey[];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 space-y-3">
      {/* Row 1: Caption presets + size slider */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-white/30 uppercase tracking-wider flex-shrink-0 w-16">Caption</span>
        <div className="flex gap-1 flex-wrap">
          {presets.map((key) => {
            const isActive = style.preset === key || (key === "none" && style.animation === "none");
            return (
              <button
                key={key}
                onClick={() => onChange({ ...PRESETS[key], titleEnabled: style.titleEnabled ?? true, titleText: style.titleText, titlePosition: style.titlePosition, titleBg: style.titleBg, titleBgColor: style.titleBgColor, titleBgOpacity: style.titleBgOpacity, titleFontFamily: style.titleFontFamily, titleFontSize: style.titleFontSize, titleColor: style.titleColor, titleBold: style.titleBold })}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all border ${
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
        {style.animation !== "none" && (
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            <input
              type="range" min={8} max={120} step={2} value={style.fontSize}
              onChange={(e) => onChange({ ...style, fontSize: Number(e.target.value), preset: "custom" })}
              className="w-32 accent-violet-400"
            />
            <span className="text-[11px] text-white/40 w-6 tabular-nums text-right">{style.fontSize}</span>
          </div>
        )}
      </div>

      {/* Row 2: Mode selector + Title toggle + More */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-white/30 uppercase tracking-wider flex-shrink-0 w-16">Format</span>

        {/* Output format pills */}
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {CONVERT_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onConvertMode(opt.value)}
              title={opt.hint}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                convertMode === opt.value
                  ? "bg-violet-500 text-white"
                  : "bg-white/[0.04] text-white/40 hover:text-white/70"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Title toggle */}
        <button
          onClick={() => onChange({ ...style, titleEnabled: !(style.titleEnabled ?? true) })}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border flex-shrink-0 ${
            (style.titleEnabled ?? true)
              ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
              : "bg-white/5 text-white/40 border-white/10 hover:text-white/60"
          }`}
        >
          Title
        </button>

        {/* More button */}
        <button
          onClick={onToggleExpand}
          className="ml-auto flex-shrink-0 text-[11px] text-white/30 hover:text-white/60 transition-colors"
        >
          {expanded ? "Less ▲" : "More ▼"}
        </button>
      </div>

      {/* Expanded full picker */}
      {expanded && (
        <div className="border-t border-white/[0.06] pt-3">
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
  const [convertMode, setConvertMode] = useState<ConvertMode>("portrait_auto");
  const [previewClipIndex, setPreviewClipIndex] = useState<number | null>(null);
  // Tracks last non-null previewClipIndex so modal ClipCard stays mounted during close (preserves download state)
  const [modalIndex, setModalIndex] = useState(0);
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo>(null);

  // Large path: the video never left the user's computer, so its clips are cut in
  // this tab once they pick the file (normally the AI Clips page does it right away).
  const [finishing, setFinishing] = useState<FinishProgress | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (previewClipIndex !== null) setModalIndex(previewClipIndex);
  }, [previewClipIndex]);

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

  async function finishWithFile(file: File) {
    if (!job || !authToken || finishing) return;
    setFinishError(null);
    setFinishing({ phase: "cutting", clip: 1, total: job.result_moments_json?.length || 1 });
    try {
      const { finishLargeJob } = await import("@/lib/aiClips/finishLargeJob");
      await finishLargeJob(file, job, authToken, setFinishing);
      const res = await fetch(`/api/ai-clips/${jobId}`, { headers: { Authorization: `Bearer ${authToken}` } });
      const json = await res.json();
      if (json.ok && json.job) setJob(json.job);
    } catch (e: any) {
      setFinishError(
        e?.name === "NotReadableError"
          ? "Your browser lost access to the video file. Make sure it's saved on this computer, then pick it again."
          : e?.message || "Cutting your clips failed. Please try again.",
      );
    } finally {
      setFinishing(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Leaving mid-way loses the clips cut so far.
  useEffect(() => {
    if (!finishing) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [finishing]);

  function handleScheduled(uploadId: string, title: string, render?: { burnJobId: string; sourceUploadId: string }) {
    const q = new URLSearchParams({ uploadId, title });
    // Captions still rendering: the scheduling screen previews the source clip and shows progress
    if (render) { q.set("renderJob", render.burnJobId); q.set("sourceUploadId", render.sourceUploadId); }
    window.location.href = `/uploads?${q.toString()}`;
  }

  /**
   * Moment metadata is keyed by `index` rather than array position — a job written
   * before scoring shipped has no moments at all, and the large path writes them in
   * its own order.
   */
  function momentFor(i: number): MomentResult | undefined {
    const moments = job?.result_moments_json;
    if (!Array.isArray(moments)) return undefined;
    return moments.find((m) => m?.index === i);
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
      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/ai-clips"
              className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              <CaretLeft className="w-4 h-4" weight="bold" />
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
            {isDownloadFailure(job.error) && (
              <Link
                href={`/ai-clips?from=${job.id}`}
                className="mt-3 inline-block rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                {UPLOAD_INSTEAD.button}
              </Link>
            )}
            <Link href="/ai-clips" className="text-xs text-red-300 hover:text-red-200 transition-colors mt-2 block">
              ← Back to AI Clips
            </Link>
          </div>
        )}

        {/* Large path, clips not cut yet: pick the video again and they're cut here */}
        {job.processing_path === "large" && job.status === "done" && !job.result_upload_ids?.length && job.result_moments_json && (() => {
          const moments = job.result_moments_json;
          const pct = finishing
            ? Math.round(100 * (finishing.phase === "saving"
                ? 1
                : (finishing.clip - 1 + (finishing.phase === "uploading" ? 0.1 + 0.9 * (finishing.fraction ?? 0) : 0)) / finishing.total))
            : 0;
          return (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void finishWithFile(f);
                }}
              />
              {finishing ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">
                      {finishing.phase === "saving"
                        ? "Saving your clips…"
                        : finishing.phase === "cutting"
                          ? `Cutting clip ${finishing.clip} of ${finishing.total}…`
                          : `Uploading clip ${finishing.clip} of ${finishing.total} (${Math.round((finishing.fraction ?? 0) * 100)}%)…`}
                    </p>
                    <span className="text-xs text-white/40 tabular-nums">{pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-white/40 text-center">
                    Your video stays on your computer, so each clip is cut right here in your browser and then uploaded. Keep this tab open.
                  </p>
                </>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">Finish your {moments.length} clips</p>
                    <p className="text-xs text-white/40 mt-1">
                      The moments are ready. Clips are cut from your video right here in your browser, so pick the same video file
                      and we&apos;ll cut them all. The video itself isn&apos;t uploaded, only the clips.
                    </p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  >
                    Pick video file
                  </button>
                </div>
              )}
              {finishError && <p className="text-xs text-red-400">{finishError}</p>}
              <ol className="space-y-1.5">
                {moments.map((m) => (
                  <li key={m.index} className="flex items-center gap-3 text-xs text-white/50">
                    <span className="w-5 text-white/25 tabular-nums">{m.index + 1}.</span>
                    <span className="flex-1 truncate">{m.title ?? `Clip ${m.index + 1}`}</span>
                    <span className="text-white/25 tabular-nums">
                      {new Date(m.start_sec * 1000).toISOString().slice(11, 19).replace(/^00:/, "")} · {Math.round(m.end_sec - m.start_sec)}s
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })()}

        {/* Small-path clips */}
        {job.status === "done" && !!job.result_upload_ids?.length && authToken && (
          <>
            {/* Subtitle quick controls + format selector */}
            <SubtitleQuickBar
              style={subtitleStyle}
              onChange={setSubtitleStyle}
              convertMode={convertMode}
              onConvertMode={setConvertMode}
              expanded={expandedCaption}
              onToggleExpand={() => setExpandedCaption((v) => !v)}
            />

            {/* Clips grid */}
            <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))" }}>
              {job.result_upload_ids.map((uploadId, i) => (
                <ClipCard
                  key={uploadId}
                  index={i}
                  uploadId={uploadId}
                  title={job.result_titles?.[i] ?? `Clip ${i + 1}`}
                  score={momentFor(i)?.score}
                  reason={momentFor(i)?.reason}
                  subtitleWords={job.result_subtitles?.[i] ?? []}
                  subtitleStyle={subtitleStyle}
                  jobId={job.id}
                  token={authToken}
                  convertMode={convertMode}
                  onScheduled={handleScheduled}
                  onStyleChange={(updates) => setSubtitleStyle((s) => ({ ...s, ...updates }))}
                  onExpand={() => setPreviewClipIndex(i)}
                />
              ))}
            </div>

            <p className="text-xs text-white/20 text-center">
              Click a clip to play · "Post" schedules to your connected accounts
            </p>
          </>
        )}
      </div>

      {/* Large preview modal — always mounted once job is done so ClipCard download state survives close */}
      {job.status === "done" && !!job.result_upload_ids?.length && authToken && (() => {
        // Use previewClipIndex when open, fall back to modalIndex when closed so ClipCard stays mounted
        const mi = previewClipIndex ?? modalIndex;
        return (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 items-center justify-center p-6"
            style={{ display: previewClipIndex !== null ? "flex" : "none" }}
            onClick={() => setPreviewClipIndex(null)}
          >
            <div
              className="relative flex gap-5 items-start"
              style={{ maxHeight: "calc(100vh - 3rem)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setPreviewClipIndex(null)}
                className="absolute -top-9 right-0 text-white/60 hover:text-white transition-colors text-sm flex items-center gap-1"
              >
                <XIcon className="w-4 h-4" weight="bold" />
                Close
              </button>

              {/* Left: clip card + nav */}
              <div className="flex flex-col items-center gap-3 flex-shrink-0">
                <ClipCard
                  key={`modal-${mi}`}
                  index={mi}
                  uploadId={job.result_upload_ids[mi]}
                  title={job.result_titles?.[mi] ?? `Clip ${mi + 1}`}
                  score={momentFor(mi)?.score}
                  reason={momentFor(mi)?.reason}
                  subtitleWords={job.result_subtitles?.[mi] ?? []}
                  subtitleStyle={subtitleStyle}
                  jobId={job.id}
                  token={authToken}
                  convertMode={convertMode}
                  onScheduled={(uid, t) => { handleScheduled(uid, t); setPreviewClipIndex(null); }}
                  onStyleChange={(updates) => setSubtitleStyle((s) => ({ ...s, ...updates }))}
                  onDownloadChange={setDownloadInfo}
                  cardWidth={320}
                />

                {/* Why this clip scored what it did, plus the AI's suggested hook */}
                {(() => {
                  const moment = momentFor(mi);
                  if (!moment?.reason && !moment?.hook_title) return null;
                  const tier = typeof moment.score === "number" ? viralityTier(moment.score) : null;
                  return (
                    <div className="w-[320px] rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
                      {moment.reason && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[9px] uppercase tracking-wider text-white/30">Why this clip</span>
                            {tier && (
                              <span className="text-[9px] font-semibold text-white/45">
                                {tier.label} · {moment.score}/100
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] leading-relaxed text-white/55">{moment.reason}</p>
                        </div>
                      )}
                      {moment.hook_title && (
                        <div className="flex items-start gap-2 border-t border-white/[0.06] pt-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] uppercase tracking-wider text-white/30 mb-0.5">Suggested hook</div>
                            <p className="text-[11px] font-medium text-white/75 break-words">{moment.hook_title}</p>
                          </div>
                          <button
                            onClick={() =>
                              setSubtitleStyle((s) => ({
                                ...s,
                                titleEnabled: true,
                                titleText: moment.hook_title!,
                              }))
                            }
                            className="flex-shrink-0 rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[10px] font-medium text-violet-200 hover:bg-violet-500/25 transition-colors"
                          >
                            Use as title
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Prev / next */}
                {job.result_upload_ids.length > 1 && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setPreviewClipIndex((i: number | null) => i === null || i === 0 ? (job.result_upload_ids!.length - 1) : i - 1)}
                      className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                    >
                      <CaretLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-xs text-white/30 tabular-nums">
                      {mi + 1} / {job.result_upload_ids.length}
                    </span>
                    <button
                      onClick={() => setPreviewClipIndex((i: number | null) => i === null ? 0 : (i + 1) % job.result_upload_ids!.length)}
                      className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                    >
                      <CaretRight className="w-4 h-4" weight="bold" />
                    </button>
                  </div>
                )}
              </div>

              {/* Right: settings panel */}
              <div
                className="w-80 flex-shrink-0 overflow-y-auto"
                style={{ maxHeight: "calc(100vh - 3rem)" }}
              >
                <SubtitleStylePicker style={subtitleStyle} onChange={setSubtitleStyle} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating download indicator — visible when modal is closed but download is still running */}
      {downloadInfo && previewClipIndex === null && (
        <div className="fixed bottom-6 right-6 z-50 w-72 rounded-2xl border border-violet-400/25 bg-[#0d0d0d]/95 backdrop-blur-md shadow-2xl overflow-hidden">
          {/* Top strip */}
          <div className="h-0.5 w-full bg-gradient-to-r from-violet-500 via-blue-500 to-violet-500 opacity-60" />
          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="inline-flex h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 border-violet-400/40 border-t-violet-400 animate-spin" />
              <p className="text-sm font-semibold text-white leading-tight">
                Downloading Clip {modalIndex + 1}
              </p>
              <button
                onClick={() => setPreviewClipIndex(modalIndex)}
                className="ml-auto text-[10px] text-violet-400 hover:text-violet-300 transition-colors whitespace-nowrap"
              >
                View →
              </button>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${downloadInfo.progress}%`,
                  background: "linear-gradient(90deg, #7c3aed, #2563eb)",
                }}
              />
            </div>

            {/* Stage text */}
            <p className="text-[11px] text-white/70">{downloadInfo.stage}</p>
            <p className="text-[10px] text-white/40 leading-snug">{RENDER_WHY}</p>

            {/* Step dots */}
            <div className="flex gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    i <= downloadInfo.stageIdx ? "bg-violet-400" : "bg-white/10"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
