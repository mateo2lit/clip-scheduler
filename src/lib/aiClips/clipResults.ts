/**
 * Builds the per-clip titles and subtitles a project page renders, from a
 * large-file job's moments and where each cut clip actually starts.
 *
 * Deliberately import-free so it can be unit-tested standalone
 * (scripts/test-ai-clip-results.mjs).
 */

type Word = { start: number; end: number; word: string };
type Moment = { start_sec: number; end_sec: number; title?: string; subtitles_json?: Word[] };

export function clipResultsFromMoments(moments: Moment[], clipStarts: number[]) {
  const titles = moments.map((m, i) => m.title || `Clip ${i + 1}`);
  // Small-path shape: word times relative to the clip's first frame. A clip cut on a
  // keyframe can start before the moment, so offset by the real start, not start_sec.
  const subtitles = moments.map((m, i) => {
    const base = Number.isFinite(clipStarts[i]) ? clipStarts[i] : m.start_sec;
    return (m.subtitles_json ?? [])
      .filter((w) => w.end <= m.end_sec && w.start >= base)
      .map((w) => ({
        start: Math.round((w.start - base) * 1000) / 1000,
        end: Math.round((w.end - base) * 1000) / 1000,
        word: w.word,
      }));
  });
  return { titles, subtitles };
}
