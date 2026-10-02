import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

/**
 * GET /api/uploads/render-status?ids=a,b
 * → { ok, statuses: { [uploadId]: render_status } }, so the Scheduled page can show
 * "Waiting for captions" for posts whose AI Clips video is still rendering.
 */
export async function GET(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;

  const ids = (new URL(req.url).searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 200);
  if (ids.length === 0) return NextResponse.json({ ok: true, statuses: {} });

  const { data } = await supabaseAdmin
    .from("uploads")
    .select("id, render_status")
    .in("id", ids)
    .eq("team_id", result.ctx.teamId);

  const statuses: Record<string, string | null> = {};
  for (const r of data ?? []) statuses[r.id] = r.render_status ?? null;
  return NextResponse.json({ ok: true, statuses });
}
