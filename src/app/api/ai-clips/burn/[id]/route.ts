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
      .from("ai_clip_burn_jobs")
      .select("id, status, result_upload_id, error, created_at, updated_at, progress_stage, progress_pct")
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Burn job not found." }, { status: 404 });
    }

    // Once done, report the captioned thumbnail the workflow stored, so posts scheduled after the
    // render finished (the workflow's backfill only reaches posts that existed then) can use it.
    // Checked in storage rather than assumed: a missing cover would fail an Instagram post.
    let thumbnail_path: string | null = null;
    if (data.status === "done") {
      const dir = `${teamId}/thumbnails`;
      const name = `ai_burned_${data.id}.jpg`;
      const { data: found } = await supabaseAdmin.storage.from("clips").list(dir, { search: name });
      if ((found ?? []).some((f: { name: string }) => f.name === name)) thumbnail_path = `${dir}/${name}`;
    }

    return NextResponse.json({ ok: true, job: { ...data, thumbnail_path } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
