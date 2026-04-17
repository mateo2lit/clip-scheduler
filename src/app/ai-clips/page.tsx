"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/login/supabaseClient";
import { SubtitleStyle, DEFAULT_SUBTITLE_STYLE } from "@/app/ai-clips/types";
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
  uploading:    { label: "Downloading video…",    min: 5,  max: 15, color: "from-blue-500 to-purple-500" },
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
    video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration / 60); };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}

function uploadFileWithProgress(file: File, signedUrl: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(`Upload failed: ${xhr.status}`)); };
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

function parseYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] || null;
    if (u.hostname.endsWith("youtube.com")) {
      if (u.pathname.startsWith("/watch")) return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(shorts|live|embed)\/([^/?]+)/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}

// ─── Progress hook ────────────────────────────────────────────────────────────

function useSimulatedProgress(status: AiClipJobStatus | null, uploadPct: number) {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!status) return;
    if (status === "uploading") { setProgress(5 + uploadPct * 0.1); return; }
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
        if (prev >= target) { clearInterval(intervalRef.current!); return prev; }
        return prev + Math.max((target - prev) * 0.04, 0.2);
      });
    }, 200);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [status, uploadPct]);

  return progress;
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ job, token }: { job: AiClipJob; token: string | null }) {
  const gradients = [
    "from-violet-900/50 via-purple-900/40 to-indigo-900/50",
    "from-blue-900/50 via-indigo-900/40 to-violet-900/50",
    "from-emerald-900/40 via-teal-900/40 to-blue-900/50",
    "from-rose-900/40 via-violet-900/40 to-purple-900/50",
  ];
  // Pick deterministic gradient based on job id
  const gradientIdx = job.id.charCodeAt(0) % gradients.length;
  const gradient = gradients[gradientIdx];
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      if (!token || job.status !== "done" || !job.result_upload_ids?.[0]) return;

      try {
        const res = await fetch(`/api/uploads/${job.result_upload_ids[0]}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled && json.ok && json.signedUrl) {
          setPreviewUrl(json.signedUrl);
        }
      } catch {}
    }

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [job.result_upload_ids, job.status, token]);

  return (
    <Link href={`/ai-clips/${job.id}`} className="group block">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden hover:border-white/20 transition-all">
        <div className={`relative aspect-video bg-gradient-to-br ${gradient} flex items-center justify-center`}>
          {previewUrl && job.status === "done" && (
            <video
              src={previewUrl}
              className="absolute inset-0 h-full w-full object-cover"
              preload="metadata"
              muted
              playsInline
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          {job.status === "done" ? (
            <>
              <div className="relative z-10 text-center">
                <div className="text-3xl font-bold text-white/80 mb-1">
                  {job.clips_generated ?? job.clip_count}
                </div>
                <div className="text-xs text-white/40">clips</div>
              </div>
              <div className="absolute top-2 right-2 z-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400 font-medium">
                Ready
              </div>
            </>
          ) : (
            <>
              <div className="relative z-10 text-center">
                <div className="text-2xl mb-1">❌</div>
                <div className="text-xs text-white/30">Failed</div>
              </div>
            </>
          )}
        </div>
        <div className="p-3">
          <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
            {job.clips_generated
              ? `${job.clips_generated} clip${job.clips_generated !== 1 ? "s" : ""} generated`
              : job.status === "failed"
              ? "Generation failed"
              : "Completed"}
          </p>
          <p className="text-xs text-white/30 mt-0.5">
            {job.source_duration_minutes > 0 ? formatMinutes(job.source_duration_minutes) + " source · " : ""}
            {new Date(job.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AiClipsPage() {
  const router = useRouter();
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [planOk, setPlanOk] = useState<boolean | null>(null);
  const [creditsUsed, setCreditsUsed] = useState(0);

  // Input state
  const [inputMode, setInputMode] = useState<"url" | "file">("url");
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlPreview, setUrlPreview] = useState<{ videoId: string; thumbnailUrl: string } | null>(null);
  const [urlMeta, setUrlMeta] = useState<{ title: string; authorName: string } | null>(null);
  const [urlMetaLoading, setUrlMetaLoading] = useState(false);
  const urlMetaAbortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileDurationMinutes, setFileDurationMinutes] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [clipCount, setClipCount] = useState(5);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const [showSubtitleConfig, setShowSubtitleConfig] = useState(false);
  const [showFileOptions, setShowFileOptions] = useState(false);

  // Settings panel state
  const [settingsTab, setSettingsTab] = useState<"ai" | "none">("ai");
  const [genre, setGenre] = useState("auto");
  const [clipLength, setClipLength] = useState("auto");
  const [autoHook, setAutoHook] = useState(true);
  const [momentPrompt, setMomentPrompt] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [activeJob, setActiveJob] = useState<AiClipJob | null>(null);
  const [pastJobs, setPastJobs] = useState<AiClipJob[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const progress = useSimulatedProgress(activeJob?.status ?? null, uploadProgress);

  // ── Boot ────────────────────────────────────────────────────────────────

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
        const planRes = await fetch("/api/team/plan", { headers: { Authorization: `Bearer ${token}` } });
        const planJson = await planRes.json();
        setPlanOk(planJson.plan === "team" && (planJson.plan_status === "active" || planJson.plan_status === "trialing"));
      } catch { setPlanOk(false); }

      try {
        const jobsRes = await fetch("/api/ai-clips", { headers: { Authorization: `Bearer ${token}` } });
        const jobsJson = await jobsRes.json();
        if (jobsJson.ok && !cancelled) {
          const jobs: AiClipJob[] = jobsJson.data ?? [];
          setCreditsUsed(jobsJson.creditsUsed ?? 0);
          const active = jobs.find((j) => j.status !== "done" && j.status !== "failed");
          const past = jobs.filter((j) => j.status === "done" || j.status === "failed");
          if (active) { setActiveJob(active); startPolling(active.id, token); }
          setPastJobs(past);
        }
      } catch {}
    }

    boot();
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── Polling ─────────────────────────────────────────────────────────────

  const startPolling = useCallback((jobId: string, token: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const startTime = Date.now();

    pollRef.current = setInterval(async () => {
      if (Date.now() - startTime > 15 * 60 * 1000) {
        clearInterval(pollRef.current!);
        setActiveJob((prev) => prev?.id === jobId ? { ...prev, status: "failed", error: "Job timed out." } : prev);
        return;
      }
      try {
        const res = await fetch(`/api/ai-clips/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
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

  // ── URL preview ──────────────────────────────────────────────────────────

  async function fetchUrlMeta(rawUrl: string) {
    if (urlMetaAbortRef.current) urlMetaAbortRef.current.abort();
    const ctrl = new AbortController();
    urlMetaAbortRef.current = ctrl;
    setUrlMetaLoading(true);
    try {
      const res = await fetch(`/api/ai-clips/url-meta?url=${encodeURIComponent(rawUrl)}`, { signal: ctrl.signal });
      const json = await res.json();
      if (!ctrl.signal.aborted && json.ok) {
        setUrlMeta({ title: json.title, authorName: json.authorName });
      }
    } catch {}
    if (!ctrl.signal.aborted) setUrlMetaLoading(false);
  }

  function handleUrlChange(val: string) {
    setUrlInput(val);
    setUrlError(null);
    const ytId = parseYoutubeId(val.trim());
    if (ytId) {
      setUrlPreview({ videoId: ytId, thumbnailUrl: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` });
      setUrlMeta(null);
      fetchUrlMeta(val.trim());
    } else {
      setUrlPreview(null);
      setUrlMeta(null);
      if (urlMetaAbortRef.current) { urlMetaAbortRef.current.abort(); urlMetaAbortRef.current = null; }
      setUrlMetaLoading(false);
    }
  }

  // ── File handling ────────────────────────────────────────────────────────

  async function handleFileSelected(selectedFile: File) {
    setFile(selectedFile);
    setSubmitError(null);
    const duration = await readVideoDuration(selectedFile);
    setFileDurationMinutes(Math.ceil(duration * 10) / 10);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("video/")) { handleFileSelected(f); setInputMode("file"); setShowFileOptions(true); }
  }

  // ── Generate from URL ────────────────────────────────────────────────────

  async function handleGenerateFromUrl() {
    if (!authToken || submitting) return;
    setUrlError(null);
    setSubmitError(null);

    const url = urlInput.trim();
    if (!url) { setUrlError("Please enter a URL."); return; }
    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|twitch\.tv)/i.test(url)) {
      setUrlError("Only YouTube and Twitch URLs are supported.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ai-clips/prepare-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: url, clip_count: clipCount, genre, clip_length: clipLength, auto_hook: autoHook, moment_prompt: momentPrompt }),
      });
      const json = await res.json();
      if (!json.ok) { setSubmitError(json.error || "Failed to start job."); setSubmitting(false); return; }

      const optimisticJob: AiClipJob = {
        id: json.jobId,
        clip_count: clipCount,
        source_duration_minutes: 0,
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
      setUrlInput("");
      setUrlPreview(null);
      setUrlMeta(null);
      setSubmitting(false);
      startPolling(json.jobId, authToken);
    } catch (e: any) {
      setSubmitError(e?.message || "Something went wrong.");
      setSubmitting(false);
    }
  }

  // ── Generate from file ───────────────────────────────────────────────────

  async function handleGenerateFromFile() {
    if (!file || !authToken || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    setUploadProgress(0);

    try {
      const prepRes = await fetch("/api/ai-clips/prepare", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ clip_count: clipCount, source_duration_minutes: fileDurationMinutes, genre, clip_length: clipLength, auto_hook: autoHook, moment_prompt: momentPrompt }),
      });
      const prepJson = await prepRes.json();
      if (!prepJson.ok) { setSubmitError(prepJson.error || "Failed to create job."); setSubmitting(false); return; }

      const { jobId, uploadUrl } = prepJson;
      const optimisticJob: AiClipJob = {
        id: jobId, clip_count: clipCount, source_duration_minutes: fileDurationMinutes,
        status: "uploading", clips_generated: null, result_upload_ids: null,
        result_titles: null, result_subtitles: null, error: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      setActiveJob(optimisticJob);

      await uploadFileWithProgress(file, uploadUrl, (pct) => setUploadProgress(pct));

      const startRes = await fetch(`/api/ai-clips/${jobId}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const startJson = await startRes.json();
      if (!startJson.ok) { setSubmitError(startJson.error || "Failed to start processing."); setActiveJob(null); setSubmitting(false); return; }

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

  // ── Computed ─────────────────────────────────────────────────────────────

  const creditsRemaining = Math.max(0, MONTHLY_CREDIT_LIMIT - creditsUsed);
  const wouldExceedLimit = fileDurationMinutes > 0 && creditsUsed + fileDurationMinutes > MONTHLY_CREDIT_LIMIT;
  const hasActiveJob = !!activeJob && activeJob.status !== "done" && activeJob.status !== "failed";
  const statusCfg = activeJob ? STATUS_CONFIG[activeJob.status] : null;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <main
      className="min-h-screen bg-[#050505] text-white relative overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-white/40 hover:text-white/70 transition-colors">Dashboard</Link>
            <Link href="/uploads" className="text-sm text-white/40 hover:text-white/70 transition-colors">Upload</Link>
            <Link href="/settings" className="text-sm text-white/40 hover:text-white/70 transition-colors">Settings</Link>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-5xl px-6 pt-8 pb-16 space-y-6">

        {/* Header row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-300">✨ AI Clips</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/50">Team Plan</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">AI Clips</h1>
            <p className="mt-1.5 text-sm text-white/50 max-w-lg">
              Paste a YouTube or Twitch link — AI finds the best moments, cuts clips, and adds subtitles.
            </p>
          </div>

          {/* Credits badge */}
          {planOk === true && (
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  <span className="text-amber-400 text-sm">⚡</span>
                  <span className="text-sm font-semibold text-white tabular-nums">{Math.round(creditsRemaining)}</span>
                  <span className="text-xs text-white/40">min left</span>
                </div>
                <Link
                  href="/settings"
                  className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-400/20 transition-colors whitespace-nowrap"
                >
                  Add more credits
                </Link>
              </div>
              <div className="w-48 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    creditsUsed / MONTHLY_CREDIT_LIMIT > 0.85
                      ? "bg-gradient-to-r from-amber-400 to-orange-400"
                      : "bg-gradient-to-r from-violet-500 to-purple-500"
                  }`}
                  style={{ width: `${Math.min((creditsUsed / MONTHLY_CREDIT_LIMIT) * 100, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-white/30 tabular-nums">{formatMinutes(creditsUsed)} / {MONTHLY_CREDIT_LIMIT} min used</p>
            </div>
          )}
        </div>

        {/* Plan gate */}
        {planOk === false && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4">
            <p className="text-sm text-amber-300">
              AI Clips is available on the <strong>Team plan</strong> only.{" "}
              <Link href="/settings" className="underline">Upgrade →</Link>
            </p>
          </div>
        )}

        {/* Input section */}
        {(!hasActiveJob) && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6 space-y-5">

            {/* URL input — primary */}
            <div>
              <label className="block text-xs text-white/40 uppercase tracking-wider mb-2">Paste a link</label>
              <div className={urlPreview ? "" : "flex gap-2"}>
                <div className="relative flex-1">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <input
                    type="url"
                    placeholder="https://youtube.com/watch?v=... or Twitch VOD URL"
                    value={urlInput}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !urlPreview) handleGenerateFromUrl(); }}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-400/50 transition-colors"
                  />
                </div>
                {/* Inline button only when no YouTube preview */}
                {!urlPreview && (
                  <button
                    onClick={handleGenerateFromUrl}
                    disabled={submitting || !urlInput.trim() || hasActiveJob || planOk !== true}
                    className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {submitting && inputMode === "url" ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Starting…
                      </span>
                    ) : (
                      "Generate clips →"
                    )}
                  </button>
                )}
              </div>
              {urlError && <p className="mt-1.5 text-xs text-red-400">{urlError}</p>}
              {!urlPreview && <p className="mt-1.5 text-xs text-white/25">YouTube and Twitch VODs supported</p>}

              {/* YouTube preview card */}
              {urlPreview && (
                <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-black">
                  <div className="relative" style={{ aspectRatio: "16/9" }}>
                    <img
                      src={urlPreview.thumbnailUrl}
                      alt="Video preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (img.src.includes("maxresdefault")) {
                          img.src = `https://img.youtube.com/vi/${urlPreview.videoId}/hqdefault.jpg`;
                        }
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                    {/* Play icon */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="rounded-full bg-black/50 backdrop-blur-sm p-4">
                        <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                    {/* Title + channel overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      {urlMetaLoading ? (
                        <div className="space-y-1.5">
                          <div className="h-3.5 w-3/4 rounded bg-white/20 animate-pulse" />
                          <div className="h-2.5 w-1/2 rounded bg-white/10 animate-pulse" />
                        </div>
                      ) : urlMeta ? (
                        <>
                          <p className="text-sm font-semibold text-white line-clamp-2 leading-snug">{urlMeta.title}</p>
                          <p className="text-xs text-white/50 mt-0.5">{urlMeta.authorName}</p>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {/* Generate button attached to preview */}
                  <div className="p-3">
                    <button
                      onClick={handleGenerateFromUrl}
                      disabled={submitting || hasActiveJob || planOk !== true}
                      className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submitting && inputMode === "url" ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          Starting…
                        </span>
                      ) : (
                        "✨ Generate clips →"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-white/20">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* File upload toggle */}
            <div>
              <button
                onClick={() => setShowFileOptions((v) => !v)}
                className="flex items-center gap-2 text-sm text-white/50 hover:text-white/70 transition-colors"
              >
                <svg className={`w-4 h-4 transition-transform ${showFileOptions ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Upload a video file
              </button>

              {showFileOptions && (
                <div className="mt-3 space-y-4">
                  <div
                    onClick={() => { fileInputRef.current?.click(); setInputMode("file"); }}
                    className="group cursor-pointer rounded-2xl border-2 border-dashed border-white/10 hover:border-white/20 transition-colors p-6 flex flex-col items-center justify-center gap-3 text-center"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { handleFileSelected(f); setInputMode("file"); }
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
                          onClick={(e) => { e.stopPropagation(); setFile(null); setFileDurationMinutes(0); setSubmitError(null); }}
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
                          <p className="text-xs text-white/30 mt-0.5">or click to browse · MP4, MOV, MKV</p>
                        </div>
                      </>
                    )}
                  </div>

                  {file && fileDurationMinutes > 0 && (
                    <div className={`rounded-xl px-4 py-2.5 text-xs flex items-center gap-2 ${
                      wouldExceedLimit
                        ? "border border-amber-400/30 bg-amber-400/10 text-amber-300"
                        : "border border-white/10 bg-white/5 text-white/50"
                    }`}>
                      {wouldExceedLimit ? "⚠️" : "ℹ️"}
                      {wouldExceedLimit
                        ? `This video (${formatMinutes(fileDurationMinutes)}) would exceed your monthly limit. ${formatMinutes(creditsRemaining)} remaining.`
                        : `This will use ${formatMinutes(fileDurationMinutes)} of credits · ${formatMinutes(creditsRemaining)} remaining`}
                    </div>
                  )}

                  {file && (
                    <button
                      onClick={() => { setInputMode("file"); handleGenerateFromFile(); }}
                      disabled={submitting || !file || fileDurationMinutes <= 0 || wouldExceedLimit || hasActiveJob || planOk !== true}
                      className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-purple-500 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submitting && inputMode === "file" ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          {uploadProgress > 0 && uploadProgress < 100 ? `Uploading ${uploadProgress}%…` : "Starting…"}
                        </span>
                      ) : (
                        "✨ Generate AI Clips"
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Settings panel — OpusClip style */}
            <div className="pt-2 border-t border-white/[0.06]">
              {/* Tabs */}
              <div className="flex gap-1 border-b border-white/[0.06] mb-4">
                <button
                  onClick={() => setSettingsTab("ai")}
                  className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    settingsTab === "ai"
                      ? "text-white border-white"
                      : "text-white/40 border-transparent hover:text-white/60"
                  }`}
                >
                  AI clipping
                </button>
                <button
                  onClick={() => setSettingsTab("none")}
                  className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    settingsTab === "none"
                      ? "text-white border-white"
                      : "text-white/40 border-transparent hover:text-white/60"
                  }`}
                >
                  Don't clip
                </button>
              </div>

              {settingsTab === "ai" && (
                <div className="space-y-4">
                  {/* Settings row */}
                  <div className="flex items-center gap-x-5 gap-y-3 flex-wrap text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-white/40 text-xs">Genre</span>
                      <select
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        className="bg-[#1a1a1a] border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
                      >
                        <option value="auto" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Auto</option>
                        <option value="podcast" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Podcast</option>
                        <option value="gaming" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Gaming</option>
                        <option value="sports" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Sports</option>
                        <option value="education" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Education</option>
                        <option value="interview" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Interview</option>
                        <option value="news" style={{ backgroundColor: "#1a1a1a", color: "white" }}>News</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-white/40 text-xs">Clip Length</span>
                      <select
                        value={clipLength}
                        onChange={(e) => setClipLength(e.target.value)}
                        className="bg-[#1a1a1a] border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
                      >
                        <option value="auto" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Auto (30s–2m)</option>
                        <option value="short" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Short (15–45s)</option>
                        <option value="medium" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Medium (45s–1.5m)</option>
                        <option value="long" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Long (1.5–3m)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-white/40 text-xs">Clips</span>
                      <select
                        value={String(clipCount)}
                        onChange={(e) => setClipCount(Number(e.target.value))}
                        className="bg-[#1a1a1a] border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
                      >
                        {[3,4,5,6,7,8,9,10].map(n => (
                          <option key={n} value={n} style={{ backgroundColor: "#1a1a1a", color: "white" }}>{n}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-white/40 text-xs">Auto hook</span>
                      <button
                        onClick={() => setAutoHook((v) => !v)}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                          autoHook ? "bg-green-500" : "bg-white/20"
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          autoHook ? "translate-x-4" : "translate-x-0.5"
                        }`} />
                      </button>
                    </div>
                  </div>

                  {/* Moment prompt */}
                  <div>
                    <p className="text-xs text-white/40 mb-1.5">Include specific moments</p>
                    <input
                      type="text"
                      placeholder="Example: find moments when we talked about the best plays"
                      value={momentPrompt}
                      onChange={(e) => setMomentPrompt(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-400/40 transition-colors"
                    />
                  </div>

                  {/* Subtitle style */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <button
                      onClick={() => setShowSubtitleConfig((v) => !v)}
                      className="flex items-center gap-2 text-sm text-white/50 hover:text-white/70 transition-colors w-full"
                    >
                      <span>Caption style</span>
                      <span className="ml-1 text-xs text-white/25">
                        ({subtitleStyle.animation === "none" ? "Off" : subtitleStyle.animation === "word_highlight" ? "Word Highlight" : "Line by Line"})
                      </span>
                      <span className="ml-auto text-white/25">{showSubtitleConfig ? "▲" : "▼"}</span>
                    </button>
                    {showSubtitleConfig && (
                      <div className="mt-4">
                        <SubtitleStylePicker style={subtitleStyle} onChange={setSubtitleStyle} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {settingsTab === "none" && (
                <div className="text-center py-6">
                  <p className="text-sm text-white/40">AI clipping disabled.</p>
                  <p className="text-xs text-white/25 mt-1">
                    Upload a file and go to the{" "}
                    <Link href="/uploads" className="text-violet-400 hover:text-violet-300 underline">
                      Uploads page
                    </Link>{" "}
                    to schedule it directly.
                  </p>
                </div>
              )}
            </div>

            {submitError && <p className="text-sm text-red-400">{submitError}</p>}
          </div>
        )}

        {/* Active job progress */}
        {hasActiveJob && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">{statusCfg?.label || activeJob?.status}</p>
              <span className="text-xs text-white/40 tabular-nums">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${statusCfg?.color || "from-blue-500 to-purple-500"} transition-all duration-300`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {activeJob?.status === "failed" && activeJob.error && (
              <p className="mt-3 text-sm text-red-400">{activeJob.error}</p>
            )}
            <div className="mt-4 flex gap-2 flex-wrap">
              {(["uploading", "transcribing", "detecting", "cutting"] as const).map((s) => {
                const stages = ["uploading", "transcribing", "detecting", "cutting"];
                const idx = stages.indexOf(s);
                const activeIdx = stages.indexOf(activeJob?.status as any);
                const done = idx < activeIdx;
                const active = s === activeJob?.status;
                return (
                  <span key={s} className={`rounded-full px-3 py-1 text-[11px] font-medium border ${
                    done ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : active ? "border-violet-400/40 bg-violet-400/10 text-violet-300"
                    : "border-white/10 bg-transparent text-white/20"
                  }`}>
                    {done ? "✓ " : ""}{STATUS_CONFIG[s].label}
                  </span>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-white/30 text-center">
              Once done, your clips will appear in Projects below.
            </p>
          </div>
        )}

        {/* Done job — navigate to project page */}
        {activeJob?.status === "done" && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 flex items-center justify-between">
            <p className="text-sm text-emerald-400 font-medium">
              ✓ {activeJob.clips_generated} clip{activeJob.clips_generated !== 1 ? "s" : ""} ready
            </p>
            <Link
              href={`/ai-clips/${activeJob.id}`}
              className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              View project →
            </Link>
          </div>
        )}

        {/* Projects */}
        {pastJobs.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-white mb-4">Projects</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {pastJobs.map((job) => (
                <ProjectCard key={job.id} job={job} token={authToken} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {pastJobs.length === 0 && !hasActiveJob && planOk === true && (
          <div className="text-center py-12 text-white/20 text-sm">
            Your projects will appear here once you generate your first clips.
          </div>
        )}
      </div>
    </main>
  );
}
