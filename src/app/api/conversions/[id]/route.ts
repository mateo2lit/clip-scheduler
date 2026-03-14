import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { data, error } = await supabaseAdmin
      .from("vertical_conversions")
      .select("id, status, style, result_upload_id, error, created_at, updated_at")
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, job: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
