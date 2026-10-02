"use client";

import { useEffect, useRef, useState } from "react";
import { renderLabel, renderBarPct } from "@/app/ai-clips/waitCopy";
import { RENDER_TIMEOUT_MS } from "@/lib/renderGate";

type Props = {
  burnJobId: string;
  token: string;
  /** Called once when the render finishes, with the captioned upload and its thumbnail (if stored). */
  onDone: (uploadId: string, thumbnailPath: string | null) => void;
};

type JobState = { stage: string | null; pct: number | null; status: string; error?: string | null };

/**
 * Honest progress for an AI Clips caption render on the scheduling screen: the real stage and
 * percent, a time estimate, and why it takes a moment. Scheduling is never blocked by it — the
 * post worker waits for the captions before publishing.
 */
export default function RenderProgressBanner({ burnJobId, token, onDone }: Props) {
  const [jobId, setJobId] = useState(burnJobId);
  const [job, setJob] = useState<JobState>({ stage: null, pct: null, status: "pending" });
  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const startRef = useRef(Date.now());
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/ai-clips/burn/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json();
        if (stopped || !j.ok) return;
        // A run that timed out or was cancelled never reports "failed"; past the timeout, treat it
        // as failed so the user gets Retry instead of an endless "taking longer than usual".
        const lastActivity = Date.parse(j.job.updated_at || j.job.created_at || "");
        const stuck = j.job.status !== "done" && j.job.status !== "failed"
          && Number.isFinite(lastActivity) && Date.now() - lastActivity > RENDER_TIMEOUT_MS;
        const status = stuck ? "failed" : j.job.status;
        setJob({ stage: j.job.progress_stage, pct: j.job.progress_pct, status, error: j.job.error });
        if (status === "done" && j.job.result_upload_id) {
          stopped = true;
          onDoneRef.current(j.job.result_upload_id, j.job.thumbnail_path ?? null);
        }
        if (status === "failed") stopped = true;
      } catch {
        // Transient network error: the next tick tries again
      }
    };
    tick();
    const poll = setInterval(() => { if (!stopped) tick(); }, 2000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { stopped = true; clearInterval(poll); clearInterval(clock); };
  }, [jobId, token]);

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const r = await fetch(`/api/ai-clips/burn/${jobId}/retry`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (j.ok) {
        startRef.current = Date.now();
        setJob({ stage: null, pct: null, status: "pending" });
        setJobId(j.burnJobId);
      } else {
        setRetryError(j.error || "Couldn't start the caption render. Please try again.");
      }
    } catch {
      setRetryError("Couldn't reach Clip Dash. Check your connection and try again.");
    } finally {
      setRetrying(false);
    }
  }

  if (job.status === "done") {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
        Captions ready ✓
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        <span>
          Couldn&apos;t add captions. Retry, and any posts for this video go out once the captions are ready.
          {retryError && <span className="mt-1 block text-xs text-red-300/80">{retryError}</span>}
        </span>
        <button
          onClick={retry}
          disabled={retrying}
          className="shrink-0 rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-500/30 disabled:opacity-50"
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  const label = renderLabel({ stage: job.stage, pct: job.pct, elapsedSec: (now - startRef.current) / 1000 });
  const barPct = renderBarPct(job.stage, job.pct);

  return (
    <div className="rounded-2xl border border-violet-400/25 bg-violet-500/10 px-4 py-3" role="status" aria-live="polite">
      <div className="text-sm font-medium text-violet-100">{label.headline}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-all duration-700"
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="mt-2 text-xs text-white/55">
        {label.detail} You can schedule now; the post waits for its captions.
      </div>
    </div>
  );
}
