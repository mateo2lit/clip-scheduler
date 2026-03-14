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
      .from("uploads")
      .select("id, bucket, file_path, file_size")
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Upload not found." }, { status: 404 });
    }

    const { data: signed } = await supabaseAdmin.storage
      .from(data.bucket)
      .createSignedUrl(data.file_path, 3600);

    return NextResponse.json({ ok: true, upload: data, signedUrl: signed?.signedUrl ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
