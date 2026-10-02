// Import-free so tests can load it directly.
// Every user-facing wait in AI Clips reads from here: what's happening, why it takes time,
// and roughly how long. Estimates come from real runs measured 2026-10-01.

export function formatAbout(sec: number): string {
  const s = Math.max(1, Math.round(sec));
  if (s < 60) return `about ${Math.max(10, Math.round(s / 5) * 5)} sec`;
  return `about ${Math.round(s / 60)} min`;
}

export const GENERATION_COPY = {
  pending: {
    title: "Getting ready",
    why: "We're starting up a machine to work on your video. This usually takes under a minute.",
  },
  uploading: {
    title: "Downloading your video",
    why: "We copy your video to the machine that will cut it. Bigger files take a little longer.",
  },
  transcribing: {
    title: "Transcribing audio",
    why: "We listen to the whole video to find what's said and when. Longer videos take longer.",
  },
  detecting: {
    title: "Finding the best moments",
    why: "AI is reading the transcript to pick the clips most likely to hold attention.",
  },
  cutting: {
    title: "Cutting your clips",
    why: "Each clip is cut and saved as its own video. This is the longest step, about 40 seconds per clip.",
  },
} as const;

export type GenerationStage = keyof typeof GENERATION_COPY;

export function generationEstimateSec(stage: GenerationStage, sourceMinutes: number, clipCount: number): number {
  const mins = Math.max(1, sourceMinutes || 1);
  const clips = Math.max(1, clipCount || 1);
  switch (stage) {
    case "pending":
      return 60;
    case "uploading":
      return 20;
    case "transcribing":
      return 10 + 5 * mins;
    case "detecting":
      return 15;
    case "cutting":
      return 40 * clips;
  }
}

export function isSlow(elapsedSec: number, estimateSec: number): boolean {
  return elapsedSec > 2 * estimateSec;
}

export const SLOW_COPY = "Taking longer than usual. It's still working, and you can leave this page; we'll keep going.";
export const RENDER_WHY = "We're drawing your captions and title into the video so they show on every platform.";
export const CAPTIONS_FAILED = {
  label: "Captions failed",
  why: "Open the clip in AI Clips and use Retry before this post's time, or it won't go out.",
};
export const WAITING_FOR_CAPTIONS = {
  label: "Waiting for captions",
  why: "This post goes out as soon as its captions finish rendering, usually within a minute or two.",
};

/** Shown when someone pastes a YouTube link. YouTube blocks downloads from our servers, so only files work. */
export const YOUTUBE_LINK_UNSUPPORTED = "YouTube links aren't supported. Download the video (YouTube Studio → Content → ⋮ → Download) and upload the file below.";

/** Written by ai-clips.yml when a pasted link can't be downloaded. `blocked` is only on older YouTube jobs. */
export const DOWNLOAD_FAILED = {
  blocked: "YouTube blocked our download of this video. Upload the video file instead, and we'll use the same settings.",
  unavailable: "We couldn't download this video. It may be private, age-restricted or region-locked. Upload the video file instead, and we'll use the same settings.",
};
export const UPLOAD_INSTEAD = {
  button: "Upload the video file instead",
  banner: "Choose the video from your computer. We've filled in the settings from your link.",
};

/** True for a job that failed because its link couldn't be downloaded (including the pre-2026-10 wording). */
export function isDownloadFailure(error: string | null | undefined): boolean {
  if (!error) return false;
  return error === DOWNLOAD_FAILED.blocked
    || error === DOWNLOAD_FAILED.unavailable
    || error.startsWith("Failed to download video");
}

const RENDER_STAGE_TEXT: Record<string, string> = {
  starting: "Starting",
  preparing: "Preparing your clip",
  rendering: "Rendering",
  uploading: "Saving the finished video",
};
const RENDER_ESTIMATE_SEC = 60;

/** Progress-bar position (0–100) from a render's real stage and percent. */
export function renderBarPct(stage: string | null, pct: number | null): number {
  if (stage === "uploading") return 97;
  if (stage === "rendering") return 10 + Math.min(100, Math.max(0, pct ?? 0)) * 0.85;
  if (stage === "preparing") return 8;
  return 3;
}

export function renderLabel(p: { stage: string | null; pct: number | null; elapsedSec: number }): {
  headline: string;
  detail: string;
  slow: boolean;
} {
  const slow = isSlow(p.elapsedSec, RENDER_ESTIMATE_SEC);
  const stageText = RENDER_STAGE_TEXT[p.stage ?? "starting"] ?? "Starting";
  let headline = `Adding captions · ${stageText}`;
  if (p.stage === "rendering" && p.pct != null && p.pct >= 1) {
    const pct = Math.min(99, Math.round(p.pct));
    const remaining = pct >= 5 ? (p.elapsedSec * (100 - pct)) / pct : RENDER_ESTIMATE_SEC;
    headline = `Adding captions · Rendering ${pct}% · ${formatAbout(remaining)} left`;
  } else if (!slow) {
    headline += ` · ${formatAbout(Math.max(10, RENDER_ESTIMATE_SEC - p.elapsedSec))} left`;
  }
  return { headline, detail: slow ? SLOW_COPY : `${RENDER_WHY} You can leave this page.`, slow };
}
