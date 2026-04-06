import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { data, error } = await supabaseAdmin
      .from("brand_assets")
      .select("id, name, file_path, file_size, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Generate short-lived signed URLs for preview
    const assets = await Promise.all(
      (data ?? []).map(async (a) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("clips")
          .createSignedUrl(a.file_path, 3600);
        return { ...a, signedUrl: signed?.signedUrl ?? null };
      })
    );

    return NextResponse.json({ ok: true, assets });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const body = await req.json().catch(() => ({}));
    const name: string = (body.name || "").trim().slice(0, 100);
    const filePath: string = (body.filePath || "").trim();
    const fileSize: number = Number(body.fileSize) || 0;

    if (!filePath) {
      return NextResponse.json({ ok: false, error: "filePath is required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("brand_assets")
      .insert({ team_id: teamId, name: name || "Untitled Asset", file_path: filePath, file_size: fileSize })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Failed to save asset." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, assetId: data.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
