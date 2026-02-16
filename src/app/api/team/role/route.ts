import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext, requireOwner } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId, role } = result.ctx;

    const ownerCheck = requireOwner(role);
    if (ownerCheck) return ownerCheck;

    const body = await req.json();
    const { userId, role: newRole } = body as { userId?: string; role?: string };

    if (!userId || !newRole) {
      return NextResponse.json(
        { ok: false, error: "Missing userId or role" },
        { status: 400 }
      );
    }

    if (newRole !== "admin" && newRole !== "member") {
      return NextResponse.json(
        { ok: false, error: "Role must be 'admin' or 'member'" },
        { status: 400 }
      );
    }

    // Verify target user is a member of the same team and not the owner
    const { data: target, error: targetErr } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();

    if (targetErr || !target) {
      return NextResponse.json(
        { ok: false, error: "User not found in team" },
        { status: 404 }
      );
    }

    if (target.role === "owner") {
      return NextResponse.json(
        { ok: false, error: "Cannot change the owner's role" },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabaseAdmin
      .from("team_members")
      .update({ role: newRole })
      .eq("team_id", teamId)
      .eq("user_id", userId);

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, role: newRole });
  } catch (e: any) {
    console.error("POST /api/team/role failed:", e?.message ?? e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
