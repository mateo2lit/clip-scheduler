import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { data: asset } = await supabaseAdmin
      .from("brand_assets")
      .select("id, file_path")
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();

    if (!asset) {
      return NextResponse.json({ ok: false, error: "Asset not found." }, { status: 404 });
    }

    // Delete from Storage
    const { error: storageErr } = await supabaseAdmin.storage.from("clips").remove([asset.file_path]);
    if (storageErr) {
      return NextResponse.json({ ok: false, error: `Storage deletion failed: ${storageErr.message}` }, { status: 500 });
    }

    // Delete DB row
    await supabaseAdmin.from("brand_assets").delete().eq("id", params.id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
