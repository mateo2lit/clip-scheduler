import { NextRequest, NextResponse } from "next/server";
import { getTeamContext } from "@/lib/teamAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;

  const { teamId } = result.ctx;
  const days = Number(req.nextUrl.searchParams.get("days") ?? "7");
  const since = new Date();
  since.setDate(since.getDate() - Math.min(days, 365));

  const { data } = await supabaseAdmin
    .from("uploads")
    .select("id, file_path, bucket, team_id, user_id")
    .eq("team_id", teamId)
    .eq("storage_deleted", false)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  return NextResponse.json({ ok: true, uploads: data ?? [] });
}
