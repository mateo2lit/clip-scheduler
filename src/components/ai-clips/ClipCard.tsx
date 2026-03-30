// src/components/ai-clips/ClipCard.tsx
"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SubtitleStyle } from "@/app/ai-clips/types";
import { SubtitlePreview } from "@/components/ai-clips/SubtitlePreview";

type ConvertMode = "portrait_blur" | "portrait_crop" | "landscape";
type TimedWord = { start: number; end: number; word: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, opacity: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, opacity / 100))})`;
}

/** Strip Whisper artifacts: [Music], (laughter), and leading/trailing punctuation. */
function cleanWord(word: string): string {
  const t = word.trim();
  if (!t) return "";
  if (/^\[.*\]$/.test(t) || /^\(.*\)$/.test(t)) return "";
  return t.replace(/^[.,!?;:"'""''`—–…\-]+|[.,!?;:"'""''`—–…\-]+$/g, "").trim();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TitleOverlay({ style, fallbackText }: { style: SubtitleStyle; fallbackText: string }) {
  if (!(style.titleEnabled ?? true)) return null;
  const text = style.titleText?.trim() || fallbackText;
  if (!text) return null;
  const isTop = (style.titlePosition ?? "top") === "top";
  const bg = style.titleBg ?? true;
  const bgColor = style.titleBgColor ?? "#FFFFFF";
  const bgOpacity = style.titleBgOpacity ?? 100;
  const color = style.titleColor ?? "#000000";
  const bold = style.titleBold ?? true;
  const fontFamily = style.titleFontFamily ?? "Montserrat";
  return (
    <div
      className={`absolute ${isTop ? "top-2" : "bottom-10"} left-2 right-2 z-20 rounded-lg px-2 py-1.5 shadow-md`}
      style={bg ? { backgroundColor: hexToRgba(bgColor, bgOpacity) } : {}}
    >
      <p
        className="text-[10px] leading-tight line-clamp-3"
        style={{ color, fontWeight: bold ? 900 : 400, fontFamily }}
      >
        {text}
      </p>
    </div>
  );
}

function LiveCaption({
  words,
  currentTime,
  style,
}: {
  words: TimedWord[];
  currentTime: number;
  style: SubtitleStyle;
}) {
  if (style.animation === "none" || !words.length) return null;

  const wpg = style.lines === 1 ? 4 : 8;

  let activeGroup: TimedWord[] | null = null;
  let activeWordIdx = 0;

  for (let i = 0; i < words.length; i += wpg) {
    const group = words.slice(i, i + wpg);
    const groupStart = group[0].start;
    const groupEnd = group[group.length - 1].end;
    if (currentTime >= groupStart - 0.05 && currentTime <= groupEnd + 0.2) {
      activeGroup = group;
      activeWordIdx = 0;
      for (let j = 0; j < group.length; j++) {
        if (currentTime >= group[j].start) activeWordIdx = j;
        else break;
      }
      break;
    }
  }

  if (!activeGroup) return null;

  const fontWeightNum = style.fontWeight === "Black" ? 900 : style.fontWeight === "Bold" ? 700 : 400;
  const posClass =
    style.position === "top"
      ? "top-2"
      : style.position === "middle"
      ? "top-1/2 -translate-y-1/2"
      : "bottom-2";
  const dropShadow = style.shadowEnabled
    ? `${style.shadowX}px ${style.shadowY}px ${style.shadowBlur}px rgba(0,0,0,0.85)`
    : undefined;

  const baseStyle: CSSProperties = {
    fontFamily: style.fontFamily + ", sans-serif",
    fontSize: `${style.fontSize}px`,
    fontWeight: fontWeightNum,
    fontStyle: style.italic ? "italic" : "normal",
    textDecoration: style.underline ? "underline" : "none",
    textTransform: style.uppercase ? "uppercase" : "none",
    WebkitTextStroke: style.strokeWidth > 0 ? `${style.strokeWidth}px ${style.strokeColor}` : undefined,
    textShadow: dropShadow,
    lineHeight: 1.3,
    paintOrder: "stroke fill" as any,
  };

  const displayWords = activeGroup.map((w) => w.word).filter(Boolean);

  if (style.animation === "word_highlight") {
    return (
      <div className={`absolute left-0 right-0 px-2 pointer-events-none text-center ${posClass}`}>
        <p style={baseStyle}>
          {displayWords.map((word, i) => (
            <span key={i} style={{ color: i === activeWordIdx ? style.highlightColor : style.primaryColor }}>
              {word}{i < displayWords.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      </div>
    );
  }

  return (
    <div className={`absolute left-0 right-0 px-2 pointer-events-none text-center ${posClass}`}>
      <p style={{ ...baseStyle, color: style.primaryColor }}>{displayWords.join(" ")}</p>
    </div>
  );
}

// ── ClipCard ──────────────────────────────────────────────────────────────────

export function ClipCard({
  index,
  uploadId,
  title,
  subtitleWords,
  subtitleStyle,
  jobId,
  token,
  convertMode,
  onScheduled,
}: {
  index: number;
  uploadId: string;
  title: string;
  subtitleWords: any[];
  subtitleStyle: SubtitleStyle;
  jobId: string;
  token: string;
  convertMode: ConvertMode;
  onScheduled: (uploadId: string, title: string) => void;
}) {
  const [burning, setBurning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [burnError, setBurnError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/uploads/${uploadId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.signedUrl) setVideoUrl(j.signedUrl); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uploadId, token]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // RAF-driven currentTime for live caption sync
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      return;
    }
    const tick = () => {
      if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [playing]);

  function togglePlay() {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play().catch(() => {}); setPlaying(true); }
  }

  // Clean Whisper artifacts for display
  const cleanedWords: TimedWord[] = (subtitleWords ?? [])
    .map((w: any) => ({ start: w.start, end: w.end, word: cleanWord(w.word) }))
    .filter((w) => w.word);
  const firstWords = cleanedWords.slice(0, 6);
  const hasRealWords = cleanedWords.length > 0;
  const hasSubtitles = subtitleStyle.animation !== "none" && hasRealWords;
  const titleEnabled = subtitleStyle.titleEnabled ?? true;
  const needsBurn = hasSubtitles || convertMode !== "landscape" || titleEnabled;

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setBurnError(null);

    if (!needsBurn) {
      // Raw download
      if (!videoUrl) { setDownloading(false); return; }
      try {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title.replace(/[^a-zA-Z0-9 \-]/g, "").trim() || `clip-${index + 1}`}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        if (videoUrl) window.open(videoUrl, "_blank");
      }
      setDownloading(false);
      return;
    }

    // Need to burn first, then download
    try {
      const res = await fetch(`/api/ai-clips/${jobId}/burn-clip`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          clip_index: index,
          subtitle_style: subtitleStyle,
          mode: convertMode,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setBurnError(json.error || "Failed to start burn.");
        setDownloading(false);
        return;
      }

      const burnJobId = json.burnJobId;
      const startTime = Date.now();

      await new Promise<void>((resolve, reject) => {
        const poll = setInterval(async () => {
          if (Date.now() - startTime > 4 * 60 * 1000) {
            clearInterval(poll);
            reject(new Error("Burn timed out."));
            return;
          }
          try {
            const pollRes = await fetch(`/api/ai-clips/burn/${burnJobId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const pollJson = await pollRes.json();
            if (pollJson.ok && pollJson.job) {
              if (pollJson.job.status === "done" && pollJson.job.result_upload_id) {
                clearInterval(poll);
                // Fetch signed URL for burned file
                const uploadRes = await fetch(`/api/uploads/${pollJson.job.result_upload_id}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const uploadJson = await uploadRes.json();
                if (uploadJson.signedUrl) {
                  const response = await fetch(uploadJson.signedUrl);
                  const blob = await response.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${title.replace(/[^a-zA-Z0-9 \-]/g, "").trim() || `clip-${index + 1}`}.mp4`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }
                resolve();
              } else if (pollJson.job.status === "failed") {
                clearInterval(poll);
                reject(new Error(pollJson.job.error || "Burn failed."));
              }
            }
          } catch {}
        }, 2000);
      });
    } catch (e: any) {
      setBurnError(e?.message || "Download failed.");
    }
    setDownloading(false);
  }

  async function handleSchedule(withSubtitles: boolean) {
    setBurnError(null);

    if (!withSubtitles || (subtitleStyle.animation === "none" && !titleEnabled) || (!hasRealWords && !titleEnabled)) {
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
          mode: convertMode,
        }),
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

  return (
    <div className="flex-shrink-0" style={{ width: "185px" }}>
      {/* 9:16 portrait card */}
      <div
        className="relative rounded-2xl overflow-hidden bg-black border border-white/10"
        style={{ aspectRatio: "9 / 16" }}
      >
        {/* Video */}
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
          <div className="absolute inset-0 bg-gradient-to-br from-violet-900/40 via-blue-900/30 to-purple-900/40 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
          </div>
        )}

        {/* Title overlay — respects titleEnabled, position, bg color, opacity, font */}
        <TitleOverlay style={subtitleStyle} fallbackText={title} />

        {/* Play button overlay */}
        {videoUrl && !playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Caption — live time-synced when playing, static preview otherwise */}
        {subtitleStyle.animation !== "none" && (
          hasRealWords ? (
            playing ? (
              <LiveCaption words={cleanedWords} currentTime={currentTime} style={subtitleStyle} />
            ) : (
              <SubtitlePreview style={subtitleStyle} words={firstWords} preview={false} />
            )
          ) : (
            <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
              <span className="text-[9px] text-white/40 bg-black/50 rounded px-1.5 py-0.5">No speech detected</span>
            </div>
          )
        )}

        {/* Clip number badge */}
        <div className="absolute bottom-2 left-2 z-20 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-white/50 font-medium pointer-events-none">
          Clip {index + 1}
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-center gap-2 mt-2.5">
        {/* Schedule */}
        <button
          onClick={() => handleSchedule(true)}
          disabled={burning}
          title={burning ? "Burning subtitles…" : "Schedule to publish"}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-xs text-violet-300 hover:bg-violet-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {burning ? (
            <span className="inline-block h-3 w-3 rounded-full border-2 border-violet-300/30 border-t-violet-300 animate-spin" />
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
          <span>Post</span>
        </button>

        {/* Download */}
        <button
          onClick={handleDownload}
          disabled={(!videoUrl && !needsBurn) || downloading}
          title={needsBurn ? "Download with effects" : "Download clip"}
          className="p-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white/50 hover:text-white/80 transition-colors disabled:opacity-30"
        >
          {downloading ? (
            <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
        </button>

        {/* No subs / post without subtitles */}
        {hasSubtitles && (
          <button
            onClick={() => handleSchedule(false)}
            disabled={burning}
            title="Post without subtitles"
            className="p-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white/50 hover:text-white/80 transition-colors disabled:opacity-30"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </button>
        )}
      </div>

      {burnError && <p className="text-[10px] text-red-400 text-center mt-1 px-1">{burnError}</p>}

      {/* Clip title */}
      <p className="text-[11px] text-white/50 text-center mt-1 px-1 line-clamp-2 leading-tight">{title}</p>
    </div>
  );
}
