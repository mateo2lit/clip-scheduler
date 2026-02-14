import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { userId, teamId } = result.ctx;

    // Check plan status — block uploads without active plan
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("plan_status")
      .eq("id", teamId)
      .single();

    const status = team?.plan_status;
    if (status !== "trialing" && status !== "active") {
      return NextResponse.json(
        { ok: false, error: "Subscribe to upload videos" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const bucket = typeof body.bucket === "string" ? body.bucket : null;
    const file_path = typeof body.file_path === "string" ? body.file_path : null;

    if (!bucket || !file_path) {
      return NextResponse.json(
        { ok: false, error: "Missing bucket or file_path" },
        { status: 400 }
      );
    }

    // Insert with service role (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("uploads")
      .insert({
        user_id: userId,
        team_id: teamId,
        bucket,
        file_path,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
