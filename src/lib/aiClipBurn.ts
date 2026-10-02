/**
 * Shared by the caption-burn routes (burn-clip and retry). Kept out of the route files because
 * Next.js only allows route handlers and route config to be exported from route.ts.
 */

// Must match the TARGETS map in .github/workflows/ai-clip-burn.yml. Anything else
// would silently fall through to landscape in the workflow, which looks like a bug
// to the user rather than a rejected input.
export const BURN_MODES = [
  "portrait_auto",
  "portrait_blur",
  "portrait_crop",
  "portrait_45",
  "square",
  "landscape",
] as const;

export async function dispatchBurnWorkflow(inputs: Record<string, string>) {
  const pat = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO || "mateo2lit/clip-scheduler";
  if (!pat) throw new Error("GITHUB_PAT not set.");
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/ai-clip-burn.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub dispatch failed (${res.status}): ${err.slice(0, 200)}`);
  }
}
