"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";
import AppPageOrb from "@/components/AppPageOrb";
import { SubtitleStyle, DEFAULT_SUBTITLE_STYLE } from "@/app/ai-clips/types";
import { SubtitlePreview } from "@/components/ai-clips/SubtitlePreview";
import { SubtitleStylePicker } from "@/components/ai-clips/SubtitleStylePicker";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  updated_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHLY_CREDIT_LIMIT = 300;

const STATUS_CONFIG: Record<AiClipJobStatus, { label: string; min: number; max: number; color: string }> = {
  pending:      { label: "Queued",                min: 0,  max: 5,  color: "from-blue-500 to-purple-500" },
  uploading:    { label: "Uploading video…",      min: 5,  max: 15, color: "from-blue-500 to-purple-500" },
  transcribing: { label: "Transcribing audio…",   min: 15, max: 50, color: "from-blue-500 to-purple-500" },
  detecting:    { label: "Finding best moments…", min: 50, max: 65, color: "from-violet-500 to-purple-500" },
  cutting:      { label: "Cutting clips…",        min: 65, max: 95, color: "from-blue-500 to-purple-500" },
  done:         { label: "Done",                  min: 100, max: 100, color: "from-emerald-400 to-teal-400" },
  failed:       { label: "Failed",                min: 100, max: 100, color: "from-red-500 to-rose-500" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration / 60); // seconds → minutes
    };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}

function uploadFileWithProgress(
  file: File,
  signedUrl: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.send(file);
  });
}

function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function useSimulatedProgress(status: AiClipJobStatus | null, uploadPct: number) {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!status) return;

    if (status === "uploading") {
      setProgress(5 + uploadPct * 0.1); // 5–15% range
      return;
    }

    const cfg = STATUS_CONFIG[status];
    if (!cfg) return;

    if (status === "done" || status === "failed") {
      setProgress(100);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const target = cfg.min + (cfg.max - cfg.min) * 0.8;
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= target) {
          clearInterval(intervalRef.current!);
          return prev;
        }
        const step = (target - prev) * 0.04;
        return prev + Math.max(step, 0.2);
      });
    }, 200);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, uploadPct]);

  return progress;
}

// ─── Clip Card ────────────────────────────────────────────────────────────────

function ClipCard({
  index,
  uploadId,
  title,
  subtitleWords,
  subtitleStyle,
  jobId,
  token,
  onScheduled,
}: {
  index: number;
  uploadId: string;
  title: string;
  subtitleWords: any[];
  subtitleStyle: SubtitleStyle;
  jobId: string;
  token: string;
  onScheduled: (uploadId: string, title: string) => void;
}) {
  const [burning, setBurning] = useState(false);
  const [burnError, setBurnError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/uploads/${uploadId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.signedUrl) setVideoUrl(j.signedUrl); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uploadId, token]);

  async function handleSchedule(withSubtitles: boolean) {
    setBurnError(null);

    if (!withSubtitles || subtitleStyle.animation === "none") {
      // Need the upload ID from the job — re-fetch
      try {
        const res = await fetch(`/api/ai-clips/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.ok && json.job?.result_upload_ids?.[index]) {
          onScheduled(json.job.result_upload_ids[index], title);
        }
      } catch {
        setBurnError("Failed to navigate. Please try again.");
      }
      return;
    }

    setBurning(true);
    try {
      const res = await fetch(`/api/ai-clips/${jobId}/burn-clip`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clip_index: index,
          subtitle_style: subtitleStyle,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setBurnError(json.error || "Failed to start subtitle burn.");
        setBurning(false);
        return;
      }

      // Poll burn job
      const burnJobId = json.burnJobId;
      const startTime = Date.now();

      pollRef.current = setInterval(async () => {
        if (Date.now() - startTime > 3 * 60 * 1000) {
          clearInterval(pollRef.current!);
          setBurning(false);
          setBurnError("Subtitle burn timed out. Try again.");
          return;
        }

        try {
          const pollRes = await fetch(`/api/ai-clips/burn/${burnJobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const pollJson = await pollRes.json();
          if (pollJson.ok && pollJson.job) {
            const job = pollJson.job;
            if (job.status === "done" && job.result_upload_id) {
              clearInterval(pollRef.current!);
              setBurning(false);
              onScheduled(job.result_upload_id, title);
            } else if (job.status === "failed") {
              clearInterval(pollRef.current!);
              setBurning(false);
              setBurnError(job.error || "Subtitle burn failed.");
            }
          }
        } catch {}
      }, 2000);
    } catch (e: any) {
      setBurning(false);
      setBurnError(e?.message || "Unknown error");
    }
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const firstWords = subtitleWords?.slice(0, 6) ?? [];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col">
      {/* Video / thumbnail area */}
      <div
        className="relative bg-gradient-to-br from-violet-900/30 via-blue-900/20 to-purple-900/30 aspect-video flex items-center justify-center cursor-pointer"
        onClick={() => {
          if (!videoUrl || !videoRef.current) return;
          if (playing) { videoRef.current.pause(); setPlaying(false); }
          else { videoRef.current.play(); setPlaying(true); }
        }}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            onEnded={() => setPlaying(false)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <svg className="w-10 h-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        )}
        {/* Play/pause overlay */}
        {videoUrl && !playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
        {subtitleStyle.animation !== "none" && firstWords.length > 0 && (
          <SubtitlePreview style={subtitleStyle} words={firstWords} />
        )}
        {subtitleStyle.animation !== "none" && firstWords.length === 0 && (
          <SubtitlePreview style={subtitleStyle} preview />
        )}
        <div className="absolute top-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/60">
          Clip {index + 1}
        </div>
      </div>

      {/* Info + actions */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{title}</p>

        {burnError && (
          <p className="text-xs text-red-400">{burnError}</p>
        )}

        <div className="flex gap-2 mt-auto pt-1">
          <button
            onClick={() => handleSchedule(true)}
            disabled={burning}
            className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {burning ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Burning…
              </span>
            ) : (
              "Schedule →"
            )}
          </button>
          {subtitleStyle.animation !== "none" && (
            <button
              onClick={() => handleSchedule(false)}
              disabled={burning}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50 hover:text-white/70 transition-colors disabled:opacity-40"
              title="Schedule without subtitles"
            >
              No subs
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AiClipsPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [planOk, setPlanOk] = useState<boolean | null>(null);
  const [creditsUsed, setCreditsUsed] = useState(0);

  const [file, setFile] = useState<File | null>(null);
  const [fileDurationMinutes, setFileDurationMinutes] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [clipCount, setClipCount] = useState(5);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const [showSubtitleConfig, setShowSubtitleConfig] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [activeJob, setActiveJob] = useState<AiClipJob | null>(null);
  const [pastJobs, setPastJobs] = useState<AiClipJob[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const progress = useSimulatedProgress(activeJob?.status ?? null, uploadProgress);

  // ── Boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }
      if (cancelled) return;

      setSessionEmail(auth.session.user.email ?? null);
      const token = auth.session.access_token;
      setAuthToken(token);

      // Check plan
      try {
        const planRes = await fetch("/api/team/plan", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const planJson = await planRes.json();
        if (planJson.plan === "team" && (planJson.plan_status === "active" || planJson.plan_status === "trialing")) {
          setPlanOk(true);
        } else {
          setPlanOk(false);
        }
      } catch {
        setPlanOk(false);
      }

      // Load existing jobs
      try {
        const jobsRes = await fetch("/api/ai-clips", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const jobsJson = await jobsRes.json();
        if (jobsJson.ok) {
          const jobs: AiClipJob[] = jobsJson.data ?? [];
          if (cancelled) return;

          setCreditsUsed(jobsJson.creditsUsed ?? 0);

          const active = jobs.find((j) => j.status !== "done" && j.status !== "failed");
          const past = jobs.filter((j) => j.status === "done" || j.status === "failed");

          if (active) {
            setActiveJob(active);
            startPolling(active.id, token);
          }
          setPastJobs(past);
        }
      } catch {}
    }

    boot();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────

  const startPolling = useCallback((jobId: string, token: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const startTime = Date.now();

    pollRef.current = setInterval(async () => {
      if (Date.now() - startTime > 15 * 60 * 1000) {
        clearInterval(pollRef.current!);
        setActiveJob((prev) =>
          prev?.id === jobId
            ? { ...prev, status: "failed", error: "Job timed out after 15 minutes." }
            : prev
        );
        return;
      }

      try {
        const res = await fetch(`/api/ai-clips/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.ok && json.job) {
          const job: AiClipJob = json.job;
          setActiveJob(job);
          if (job.status === "done" || job.status === "failed") {
            clearInterval(pollRef.current!);
            if (job.status === "done") {
              setCreditsUsed((prev) => prev + (job.source_duration_minutes ?? 0));
              setPastJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
            }
          }
        }
      } catch {}
    }, 2500);
  }, []);

  // ── File handling ─────────────────────────────────────────────────────────

  async function handleFileSelected(selectedFile: File) {
    setFile(selectedFile);
    setSubmitError(null);
    const duration = await readVideoDuration(selectedFile);
    setFileDurationMinutes(Math.ceil(duration * 10) / 10);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("video/")) handleFileSelected(f);
  }

  // ── Generate ──────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!file || !authToken || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    setUploadProgress(0);

    try {
      // 1. Create job + get signed URL
      const prepRes = await fetch("/api/ai-clips/prepare", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clip_count: clipCount,
          source_duration_minutes: fileDurationMinutes,
        }),
      });
      const prepJson = await prepRes.json();
      if (!prepJson.ok) {
        setSubmitError(prepJson.error || "Failed to create job.");
        setSubmitting(false);
        return;
      }

      const { jobId, uploadUrl } = prepJson;

      // Optimistic: show uploading state
      const optimisticJob: AiClipJob = {
        id: jobId,
        clip_count: clipCount,
        source_duration_minutes: fileDurationMinutes,
        status: "uploading",
        clips_generated: null,
        result_upload_ids: null,
        result_titles: null,
        result_subtitles: null,
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setActiveJob(optimisticJob);

      // 2. Upload file to signed URL
      await uploadFileWithProgress(file, uploadUrl, (pct) => setUploadProgress(pct));

      // 3. Dispatch workflow
      const startRes = await fetch(`/api/ai-clips/${jobId}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const startJson = await startRes.json();
      if (!startJson.ok) {
        setSubmitError(startJson.error || "Failed to start processing.");
        setActiveJob(null);
        setSubmitting(false);
        return;
      }

      // 4. Start polling
      setFile(null);
      setFileDurationMinutes(0);
      setSubmitting(false);
      startPolling(jobId, authToken);
    } catch (e: any) {
      setSubmitError(e?.message || "Something went wrong.");
      setSubmitting(false);
      setActiveJob(null);
    }
  }

  // ── Schedule callback ─────────────────────────────────────────────────────

  function handleScheduled(uploadId: string, title: string) {
    window.location.href = `/uploads?uploadId=${encodeURIComponent(uploadId)}&title=${encodeURIComponent(title)}`;
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const creditsRemaining = Math.max(0, MONTHLY_CREDIT_LIMIT - creditsUsed);
  const creditsFraction = Math.min(creditsUsed / MONTHLY_CREDIT_LIMIT, 1);
  const wouldExceedLimit = fileDurationMinutes > 0 && creditsUsed + fileDurationMinutes > MONTHLY_CREDIT_LIMIT;
  const canGenerate =
    !!file &&
    !submitting &&
    planOk === true &&
    fileDurationMinutes > 0 &&
    !wouldExceedLimit &&
    !activeJob;

  const statusCfg = activeJob ? STATUS_CONFIG[activeJob.status] : null;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <AppPageOrb />
      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-white/40 hover:text-white/70 transition-colors">
              Dashboard
            </Link>
            <Link href="/uploads" className="text-sm text-white/40 hover:text-white/70 transition-colors">
              Upload
            </Link>
            <Link href="/settings" className="text-sm text-white/40 hover:text-white/70 transition-colors">
              Settings
            </Link>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-5xl px-6 pt-10 pb-16 space-y-6">

        {/* Header */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-300">
              ✨ AI Clips
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/50">
              Team Plan
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">AI Clips</h1>
          <p className="mt-2 text-sm text-white/60 max-w-lg">
            Upload a long-form video and AI will automatically find the best moments, cut them into short clips, and add customizable subtitles.
          </p>

          {/* Credits bar */}
          {planOk === true && (
            <div className="mt-5 flex items-center gap-4">
              <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    creditsFraction > 0.85
                      ? "bg-gradient-to-r from-amber-400 to-orange-400"
                      : "bg-gradient-to-r from-violet-500 to-purple-500"
                  }`}
                  style={{ width: `${creditsFraction * 100}%` }}
                />
              </div>
              <span className="text-xs text-white/40 whitespace-nowrap tabular-nums">
                {formatMinutes(creditsUsed)} / {MONTHLY_CREDIT_LIMIT} min used this month
              </span>
            </div>
          )}
        </div>

        {/* Plan gate banner */}
        {planOk === false && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4">
            <p className="text-sm text-amber-300">
              AI Clips is available on the <strong>Team plan</strong> only.{" "}
              <Link href="/settings" className="underline">
                Upgrade →
              </Link>
            </p>
          </div>
        )}

        {/* Active job progress */}
        {activeJob && activeJob.status !== "done" && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">
                {statusCfg?.label || activeJob.status}
              </p>
              <span className="text-xs text-white/40 tabular-nums">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${statusCfg?.color || "from-blue-500 to-purple-500"} transition-all duration-300`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {activeJob.status === "failed" && activeJob.error && (
              <p className="mt-3 text-sm text-red-400">{activeJob.error}</p>
            )}
            {/* Stage pills */}
            <div className="mt-4 flex gap-2 flex-wrap">
              {(["uploading", "transcribing", "detecting", "cutting"] as const).map((s) => {
                const idx = ["uploading", "transcribing", "detecting", "cutting"].indexOf(s);
                const activeIdx = ["uploading", "transcribing", "detecting", "cutting"].indexOf(activeJob.status as any);
                const done = idx < activeIdx;
                const active = s === activeJob.status;
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
                    {STATUS_CONFIG[s].label}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Results grid */}
        {activeJob?.status === "done" && activeJob.result_upload_ids && authToken && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">
                {activeJob.clips_generated} clip{activeJob.clips_generated !== 1 ? "s" : ""} ready
              </h2>
              <span className="text-xs text-white/40">
                {formatMinutes(activeJob.source_duration_minutes)} source
              </span>
            </div>

            {/* Subtitle style picker for results */}
            <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <button
                onClick={() => setShowSubtitleConfig((v) => !v)}
                className="flex items-center gap-2 text-sm text-white/60 hover:text-white/80 transition-colors w-full"
              >
                <span>Subtitle style</span>
                <span className="ml-auto text-white/30">{showSubtitleConfig ? "▲" : "▼"}</span>
              </button>
              {showSubtitleConfig && (
                <div className="mt-4">
                  <SubtitleStylePicker style={subtitleStyle} onChange={setSubtitleStyle} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {activeJob.result_upload_ids.map((uploadId, i) => (
                <ClipCard
                  key={uploadId}
                  index={i}
                  uploadId={uploadId}
                  title={activeJob.result_titles?.[i] ?? `Clip ${i + 1}`}
                  subtitleWords={activeJob.result_subtitles?.[i] ?? []}
                  subtitleStyle={subtitleStyle}
                  jobId={activeJob.id}
                  token={authToken}
                  onScheduled={handleScheduled}
                />
              ))}
            </div>
          </div>
        )}

        {/* Upload + generate form (only when no active job in progress) */}
        {(!activeJob || activeJob.status === "done" || activeJob.status === "failed") && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6">
            <h2 className="text-base font-semibold text-white mb-4">
              Generate new clips
            </h2>

            {/* Drag & drop zone */}
            <div
              ref={dragRef}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="group cursor-pointer rounded-2xl border-2 border-dashed border-white/10 hover:border-white/20 transition-colors p-8 flex flex-col items-center justify-center gap-3 text-center"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                  e.target.value = "";
                }}
              />
              {file ? (
                <>
                  <div className="h-10 w-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{file.name}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {fileDurationMinutes > 0 ? formatMinutes(fileDurationMinutes) : "Reading duration…"}
                      {" · "}
                      {(file.size / 1024 / 1024).toFixed(0)} MB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setFileDurationMinutes(0);
                      setSubmitError(null);
                    }}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors"
                  >
                    Change file
                  </button>
                </>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                    <svg className="w-5 h-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/70">Drop a video file here</p>
                    <p className="text-xs text-white/30 mt-0.5">or click to browse · MP4, MOV, MKV, etc.</p>
                  </div>
                </>
              )}
            </div>

            {/* Credit cost preview */}
            {file && fileDurationMinutes > 0 && (
              <div
                className={`mt-3 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2 ${
                  wouldExceedLimit
                    ? "border border-amber-400/30 bg-amber-400/10 text-amber-300"
                    : "border border-white/10 bg-white/5 text-white/50"
                }`}
              >
                {wouldExceedLimit ? "⚠️" : "ℹ️"}
                {wouldExceedLimit
                  ? `This video (${formatMinutes(fileDurationMinutes)}) would exceed your monthly limit. You have ${formatMinutes(creditsRemaining)} remaining.`
                  : `This will use ${formatMinutes(fileDurationMinutes)} of credits · ${formatMinutes(creditsRemaining)} remaining`}
              </div>
            )}

            {/* Clip count */}
            <div className="mt-5">
              <label className="flex items-center justify-between text-xs text-white/40 uppercase tracking-wider mb-2">
                <span>Clips to generate</span>
                <span className="text-white font-semibold text-sm normal-case tracking-normal">
                  {clipCount} clip{clipCount !== 1 ? "s" : ""}
                </span>
              </label>
              <input
                type="range"
                min={3}
                max={10}
                value={clipCount}
                onChange={(e) => setClipCount(Number(e.target.value))}
                className="w-full accent-violet-400"
              />
              <div className="flex justify-between text-[10px] text-white/20 mt-1">
                <span>3</span>
                <span>10</span>
              </div>
            </div>

            {/* Subtitle style config */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
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

            {submitError && (
              <p className="mt-4 text-sm text-red-400">{submitError}</p>
            )}

            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-purple-500 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  {uploadProgress > 0 && uploadProgress < 100
                    ? `Uploading ${uploadProgress}%…`
                    : "Starting…"}
                </span>
              ) : (
                "✨ Generate AI Clips"
              )}
            </button>

            {!canGenerate && !submitting && activeJob && activeJob.status !== "done" && activeJob.status !== "failed" && (
              <p className="mt-2 text-center text-xs text-white/30">
                Wait for the current job to finish before starting a new one.
              </p>
            )}
          </div>
        )}

        {/* Past jobs */}
        {pastJobs.length > 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-base font-semibold text-white mb-4">Past jobs</h2>
            <div className="space-y-2">
              {pastJobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <div
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      job.status === "done" ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/70 truncate">
                      {job.clips_generated
                        ? `${job.clips_generated} clip${job.clips_generated !== 1 ? "s" : ""} generated`
                        : job.status === "failed"
                        ? "Failed"
                        : "Completed"}
                    </p>
                    <p className="text-xs text-white/30">
                      {formatMinutes(job.source_duration_minutes)} source ·{" "}
                      {new Date(job.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {job.status === "done" && job.result_upload_ids && (
                    <button
                      onClick={() => {
                        setActiveJob(job);
                        setPastJobs((prev) => prev.filter((j) => j.id !== job.id));
                      }}
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors whitespace-nowrap"
                    >
                      View clips
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
