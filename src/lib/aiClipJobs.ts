import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ACTIVE_AI_CLIP_STATUSES,
  STALE_ACTIVE_JOB_MS,
  isStaleActiveJob,
} from "@/lib/aiClipJobStaleness";

export {
  ACTIVE_AI_CLIP_STATUSES,
  STALE_ACTIVE_JOB_MS,
  isStaleActiveJob,
} from "@/lib/aiClipJobStaleness";

const STALE_JOB_ERROR =
  "This job stopped responding and was closed automatically. This usually means the browser tab was closed before processing finished. Please start it again.";

/**
 * Marks this team's abandoned AI clip jobs as failed.
 *
 * A job only leaves a non-terminal status when something actively advances it —
 * the GitHub workflow, or the browser uploading audio chunks. If that half of
 * the flow dies (tab closed, workflow never dispatched), the row sits in
 * `pending` forever. Nothing else reaps it, and because every prepare route
 * refuses to start a job while one is active, a single orphan makes AI Clips
 * permanently unusable for the whole team while the UI shows a progress bar
 * that can never move.
 *
 * Safe to call on every read: it is idempotent, scoped to one team, and only
 * touches rows that are provably past the staleness window.
 *
 * Returns the number of jobs closed. Never throws — cleanup failing must not
 * take down the request it was piggybacking on.
 */
export async function reapStaleAiClipJobs(teamId: string): Promise<number> {
  try {
    const { data: candidates } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id, status, updated_at, created_at")
      .eq("team_id", teamId)
      .in("status", ACTIVE_AI_CLIP_STATUSES as unknown as string[]);

    if (!candidates?.length) return 0;

    const now = new Date();
    const staleIds = candidates.filter((j) => isStaleActiveJob(j, now)).map((j) => j.id);
    if (!staleIds.length) return 0;

    const { error } = await supabaseAdmin
      .from("ai_clip_jobs")
      .update({
        status: "failed",
        error: STALE_JOB_ERROR,
        updated_at: now.toISOString(),
      })
      .in("id", staleIds);

    if (error) {
      console.error("reapStaleAiClipJobs update failed:", error.message);
      return 0;
    }

    console.warn(`Closed ${staleIds.length} stale AI clip job(s) for team ${teamId}: ${staleIds.join(", ")}`);
    return staleIds.length;
  } catch (e: any) {
    console.error("reapStaleAiClipJobs error:", e?.message);
    return 0;
  }
}
