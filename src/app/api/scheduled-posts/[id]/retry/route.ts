import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { id } = params;
    if (!id) return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });

    const { data: post } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, status, team_id")
      .eq("id", id)
      .maybeSingle();

    if (!post) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (post.team_id !== teamId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (post.status !== "failed") {
      return NextResponse.json({ ok: false, error: "Only failed posts can be retried" }, { status: 409 });
    }

    const { error } = await supabaseAdmin
      .from("scheduled_posts")
      .update({ status: "scheduled", last_error: null })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
