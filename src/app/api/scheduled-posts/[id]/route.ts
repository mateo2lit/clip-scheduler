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

    const body = await req.json().catch(() => ({}));
    const { title, description, scheduled_for } = body;

    // Verify the post belongs to this team and is still scheduled
    const { data: post } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, status, team_id")
      .eq("id", id)
      .maybeSingle();

    if (!post) return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
    if (post.team_id !== teamId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (post.status !== "scheduled") return NextResponse.json({ ok: false, error: "Only scheduled posts can be edited" }, { status: 400 });

    const updates: Record<string, string> = {};
    if (typeof title === "string") updates.title = title;
    if (typeof description === "string") updates.description = description;
    if (typeof scheduled_for === "string") updates.scheduled_for = scheduled_for;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from("scheduled_posts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, post: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
