"use client";

import { useEffect, useRef, useState } from "react";
import { X as XIcon, Check, Crop } from "@phosphor-icons/react/dist/ssr";

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

export interface ImportConvertOptions {
  convertTo916: boolean;
  convertStyle: "blur" | "crop";
}

interface Props {
  token: string;
  onClose: () => void;
  onImported: (uploadId: string, title: string, options?: ImportConvertOptions) => void;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        checked ? "bg-blue-500" : "bg-white/15"
      }`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
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
  // 9:16 conversion intent — captured before import, applied by parent after import done.
  // Default ON because Twitch/Kick clips are virtually always 16:9 and most users want shorts.
  const [convertTo916, setConvertTo916] = useState(true);
  const [convertStyle, setConvertStyle] = useState<"blur" | "crop">("blur");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number | null>(null);

  const progress = useSimulatedProgress(job?.status ?? "pending");

  // Stop polling when done/failed or after 15-minute timeout
  useEffect(() => {
    if (job?.status === "done" || job?.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [job?.status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function hasMultipleUrls(input: string) {
    const matches = input.match(/https?:\/\//gi) || [];
    return matches.length > 1;
  }

  async function startImport() {
    setSubmitError(null);
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setSubmitError("URL is required.");
      return;
    }
    if (hasMultipleUrls(trimmedUrl)) {
      setSubmitError("Please paste a single URL.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: trimmedUrl }),
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
      pollStartRef.current = Date.now();

      // Start polling — timeout after 15 minutes
      pollRef.current = setInterval(async () => {
        if (pollStartRef.current && Date.now() - pollStartRef.current > 15 * 60 * 1000) {
          clearInterval(pollRef.current!);
          setJob((prev) => prev ? { ...prev, status: "failed", error: "Import timed out. The clip may be too large or the worker encountered an error." } : prev);
          return;
        }
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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
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
            <p className="text-xs text-white/40 mt-0.5">Twitch and Kick clip links</p>
          </div>
          {!isActive && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
            >
              <XIcon className="w-4 h-4" weight="bold" />
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
              <span>Twitch</span>
              <span>Kick</span>
            </div>

            {/* Convert to 9:16 — captured up-front since Twitch/Kick are 16:9 by default */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                    <Crop className="h-4 w-4 text-white/60" weight="bold" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">Convert to 9:16</p>
                    <p className="mt-0.5 text-[11px] text-white/40">Reformat for TikTok, Reels, and Shorts.</p>
                  </div>
                </div>
                <Toggle checked={convertTo916} onChange={setConvertTo916} />
              </div>
              {convertTo916 && (
                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-white/30 mb-2">Style</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["blur", "crop"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setConvertStyle(s)}
                        className={`rounded-lg border px-3 py-2 text-xs transition-all ${
                          convertStyle === s
                            ? "border-white/30 bg-white/10 text-white"
                            : "border-white/10 bg-white/[0.02] text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                        }`}
                      >
                        {s === "blur" ? "Blur background" : "Crop center"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={startImport}
              disabled={submitting || !url.trim()}
              className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Starting…" : convertTo916 ? "Import & convert →" : "Import clip →"}
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
                        <Check className="w-3 h-3" weight="bold" />
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
                  onClick={() => onImported(
                    job.upload_id!,
                    job.title || "Imported clip",
                    { convertTo916, convertStyle },
                  )}
                  className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  {convertTo916 ? "Schedule & convert to 9:16 →" : "Schedule this clip →"}
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

    </div>
  );
}
