"use client";

import { useEffect, useRef, useState } from "react";
import { renderLabel } from "@/app/ai-clips/waitCopy";

type Props = {
  burnJobId: string;
  token: string;
  /** Called once with the captioned upload's id when the render finishes. */
  onDone: (uploadId: string) => void;
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
        setJob({ stage: j.job.progress_stage, pct: j.job.progress_pct, status: j.job.status, error: j.job.error });
        if (j.job.status === "done" && j.job.result_upload_id) {
          stopped = true;
          onDoneRef.current(j.job.result_upload_id);
        }
        if (j.job.status === "failed") stopped = true;
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
    try {
      const r = await fetch(`/api/ai-clips/burn/${jobId}/retry`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (j.ok) {
        startRef.current = Date.now();
        setJob({ stage: null, pct: null, status: "pending" });
        setJobId(j.burnJobId);
      }
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
        <span>Couldn&apos;t add captions. Anything you schedule waits until they&apos;re added, so try again.</span>
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
  const barPct =
    job.stage === "uploading" ? 97
    : job.stage === "rendering" ? 10 + Math.min(100, Math.max(0, job.pct ?? 0)) * 0.85
    : job.stage === "preparing" ? 8
    : 3;

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
