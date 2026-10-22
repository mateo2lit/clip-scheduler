// Splits a finished group into "this round" and "earlier", so the summary email after a retry
// names only what was just tried. A retry (/api/scheduled-posts/[id]/retry) records nothing,
// but the worker stamps ig_container_created_at when it picks a post up: a first run picks up
// a group's posts within minutes of each other, while a retried post is picked up long after
// the rest finished. A retry within RETRY_GAP_MINUTES reads as one round, so the email falls
// back to the full summary.

/** Longest pause between pick-ups that still counts as the same run. A busy queue spaces a
 *  group's posts a minute or so apart, never this far. */
export const RETRY_GAP_MINUTES = 15;

export type GroupResult = { platform: string; ok: boolean; error?: string };

type GroupPost = {
  provider: string;
  status: string;
  last_error?: string | null;
  ig_container_created_at?: string | null;
};

export function splitByRound(posts: GroupPost[]): { thisRound: GroupResult[]; earlier: GroupResult[] } {
  const toResult = (p: GroupPost): GroupResult => ({
    platform: p.provider,
    ok: p.status === "posted",
    error: p.last_error || undefined,
  });
  const claimedAt = (p: GroupPost) => (p.ig_container_created_at ? Date.parse(p.ig_container_created_at) : NaN);

  // Walk back from the latest pick-up while the gaps stay short; that chain is this round.
  const times = posts.map(claimedAt).filter((t) => !Number.isNaN(t)).sort((a, b) => b - a);
  if (times.length === 0) return { thisRound: posts.map(toResult), earlier: [] };
  let roundStart = times[0];
  for (const t of times.slice(1)) {
    if (roundStart - t > RETRY_GAP_MINUTES * 60_000) break;
    roundStart = t;
  }

  const inRound = (p: GroupPost) => claimedAt(p) >= roundStart;
  const isRetry = posts.some((p) => !Number.isNaN(claimedAt(p)) && !inRound(p));
  if (!isRetry) return { thisRound: posts.map(toResult), earlier: [] };

  return {
    thisRound: posts.filter(inRound).map(toResult),
    earlier: posts.filter((p) => !inRound(p)).map(toResult),
  };
}
