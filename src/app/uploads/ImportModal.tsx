"use client";

import { useEffect, useRef, useState } from "react";

type JobStatus = "pending" | "fetching" | "uploading" | "done" | "failed";

interface ImportJob {
  id: string;
  status: JobStatus;
  title?: string | null;
  source_platform?: string | null;
  upload_id?: string | null;
  error?: string | null;
  duration_seconds?: number | null;
}

interface Props {
  token: string;
  onClose: () => void;
  onImported: (uploadId: string, title: string) => void;
}

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  twitch: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  ),
  kick: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.5 16.5v-9l7.5 4.5-7.5 4.5z" />
    </svg>
  ),
  youtube: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
};

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; sublabel: string; min: number; max: number; color: string }
> = {
  pending:   { label: "Queued",                   sublabel: "Starting import worker…",       min: 0,   max: 18,  color: "from-blue-500 to-purple-500" },
  fetching:  { label: "Fetching clip info",        sublabel: "Reading metadata from source…", min: 18,  max: 42,  color: "from-blue-500 to-purple-500" },
  uploading: { label: "Downloading & uploading",   sublabel: "Streaming clip to Clip Dash…",  min: 42,  max: 88,  color: "from-blue-500 to-purple-500" },
  done:      { label: "Clip ready!",               sublabel: "Import complete.",               min: 100, max: 100, color: "from-emerald-400 to-teal-400" },
  failed:    { label: "Import failed",             sublabel: "",                               min: 100, max: 100, color: "from-red-500 to-rose-500" },
};

function useSimulatedProgress(status: JobStatus) {
  const [progress, setProgress] = useState(0);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (animRef.current) clearInterval(animRef.current);

    const cfg = STATUS_CONFIG[status];
    const target = cfg.min + (cfg.max - cfg.min) * 0.75; // animate to 75% of the range, then hold

    if (status === "done" || status === "failed") {
      setProgress(100);
      return;
    }

    // Jump to the start of this status's range immediately
    setProgress((prev) => Math.max(prev, cfg.min));

    // Slowly drift toward the target within this status's range
    animRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= target) return prev;
        const step = (target - prev) * 0.04; // ease-out: moves fast then slows
        return Math.min(prev + Math.max(step, 0.15), target);
      });
    }, 120);

    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, [status]);

  return progress;
}

export default function ImportModal({ token, onClose, onImported }: Props) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const progress = useSimulatedProgress(job?.status ?? "pending");

  // Stop polling when done/failed
  useEffect(() => {
    if (job?.status === "done" || job?.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [job?.status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function startImport() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!json.ok) {
        setSubmitError(json.error || "Failed to start import.");
        setSubmitting(false);
        return;
      }
      const newJob: ImportJob = { id: json.jobId, status: "pending", source_platform: json.platform };
      setJob(newJob);
      setSubmitting(false);

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/imports/${json.jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const pollJson = await pollRes.json();
          if (pollJson.ok && pollJson.job) {
            setJob(pollJson.job);
          }
        } catch {}
      }, 2500);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const cfg = STATUS_CONFIG[job?.status ?? "pending"];
  const isActive = job && job.status !== "done" && job.status !== "failed";
  const isDone = job?.status === "done";
  const isFailed = job?.status === "failed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => { if (!isActive) onClose(); }}
      />

      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0a0a0f] shadow-[0_40px_120px_rgba(0,0,0,0.6)] p-6 z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Import from URL</h2>
            <p className="text-xs text-white/40 mt-0.5">Twitch, Kick, YouTube, Reddit, and more</p>
          </div>
          {!isActive && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* URL input — only show before job starts */}
        {!job && (
          <div className="space-y-3">
            <input
              type="url"
              placeholder="https://clips.twitch.tv/... or kick.com/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) startImport(); }}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20 transition-colors"
            />
            {submitError && (
              <p className="text-xs text-red-400 px-1">{submitError}</p>
            )}
            <div className="flex gap-2 text-[11px] text-white/30 px-1 flex-wrap">
              <span>✓ Twitch</span>
              <span>✓ Kick</span>
              <span>✓ YouTube</span>
              <span>✓ Reddit</span>
              <span>✓ Vimeo</span>
              <span className="text-white/20">+ 1000 more via yt-dlp</span>
            </div>
            <button
              onClick={startImport}
              disabled={submitting || !url.trim()}
              className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Starting…" : "Import clip →"}
            </button>
          </div>
        )}

        {/* Progress state */}
        {job && (
          <div className="space-y-5">
            {/* URL + platform badge */}
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
              {job.source_platform && PLATFORM_ICONS[job.source_platform] && (
                <span className="text-white/40 shrink-0">
                  {PLATFORM_ICONS[job.source_platform]}
                </span>
              )}
              <span className="text-xs text-white/40 truncate flex-1">{url}</span>
              {job.source_platform && job.source_platform !== "unknown" && (
                <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/30 capitalize">
                  {job.source_platform}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isDone ? "text-emerald-400" : isFailed ? "text-red-400" : "text-white"}`}>
                  {cfg.label}
                </span>
                <span className="text-xs text-white/30">{Math.round(progress)}%</span>
              </div>

              {/* Track */}
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden relative">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${cfg.color} transition-all duration-700 ease-out relative overflow-hidden`}
                  style={{ width: `${progress}%` }}
                >
                  {/* Shimmer sweep — only while in progress */}
                  {isActive && (
                    <div className="absolute inset-0 animate-shimmer" />
                  )}
                </div>
              </div>

              <p className="text-xs text-white/35">
                {isFailed ? (job.error || "Something went wrong.") : cfg.sublabel}
              </p>
            </div>

            {/* Stage pills */}
            {!isFailed && (
              <div className="flex gap-2 flex-wrap">
                {(["pending", "fetching", "uploading", "done"] as JobStatus[]).map((s) => {
                  const statusOrder = { pending: 0, fetching: 1, uploading: 2, done: 3, failed: 4 };
                  const currentOrder = statusOrder[job.status];
                  const thisOrder = statusOrder[s];
                  const isPast = thisOrder < currentOrder;
                  const isCurrent = s === job.status;
                  return (
                    <div
                      key={s}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-all duration-500 ${
                        isPast
                          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-400"
                          : isCurrent
                          ? "border-blue-400/40 bg-blue-500/10 text-blue-300"
                          : "border-white/[0.06] text-white/20"
                      }`}
                    >
                      {isPast ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isCurrent ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
                      )}
                      {s === "pending" ? "Queued" : s === "fetching" ? "Fetching" : s === "uploading" ? "Uploading" : "Ready"}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Done state */}
            {isDone && job.upload_id && (
              <div className="space-y-3 pt-1">
                {job.title && (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <p className="text-[11px] text-white/30 mb-0.5">Clip title</p>
                    <p className="text-sm text-white/80 truncate">{job.title}</p>
                  </div>
                )}
                <button
                  onClick={() => onImported(job.upload_id!, job.title || "Imported clip")}
                  className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  Schedule this clip →
                </button>
              </div>
            )}

            {/* Failed state */}
            {isFailed && (
              <button
                onClick={onClose}
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm text-white/60 hover:bg-white/10 transition-colors"
              >
                Close
              </button>
            )}

            {/* Cancel while pending (before runner picks it up) */}
            {job.status === "pending" && (
              <p className="text-center text-xs text-white/25">
                Import worker starting up — this takes ~30–60 seconds
              </p>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(300%) skewX(-15deg); }
        }
        .animate-shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          animation: shimmer 1.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
