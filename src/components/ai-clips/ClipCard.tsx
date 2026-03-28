// src/components/ai-clips/ClipCard.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { SubtitleStyle } from "@/app/ai-clips/types";
import { SubtitlePreview } from "@/components/ai-clips/SubtitlePreview";

export function ClipCard({
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
        body: JSON.stringify({ clip_index: index, subtitle_style: subtitleStyle }),
      });
      const json = await res.json();
      if (!json.ok) {
        setBurnError(json.error || "Failed to start subtitle burn.");
        setBurning(false);
        return;
      }

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
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const firstWords = subtitleWords?.slice(0, 6) ?? [];

  function togglePlay() {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setPlaying(true);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col">
      {/* Video / thumbnail area */}
      <div className="relative bg-gradient-to-br from-violet-900/30 via-blue-900/20 to-purple-900/30 aspect-video flex items-center justify-center">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-cover cursor-pointer"
            playsInline
            onEnded={() => setPlaying(false)}
            onClick={togglePlay}
          />
        ) : (
          <svg className="w-10 h-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        )}
        {/* Play overlay */}
        {videoUrl && !playing && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer pointer-events-none"
          >
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
        <div className="absolute top-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/60 pointer-events-none">
          Clip {index + 1}
        </div>
      </div>

      {/* Info + actions */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{title}</p>

        {burnError && <p className="text-xs text-red-400">{burnError}</p>}

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
