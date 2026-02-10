import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId, role } = result.ctx;

    // Fetch team info
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("name")
      .eq("id", teamId)
      .single();

    // Fetch members with email from auth.users
    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("user_id, role, joined_at")
      .eq("team_id", teamId);

    // Look up emails for each member
    const membersWithEmail = [];
    for (const m of members ?? []) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
        m.user_id
      );
      membersWithEmail.push({
        userId: m.user_id,
        email: userData?.user?.email ?? null,
        role: m.role,
        joinedAt: m.joined_at,
      });
    }

    // Fetch pending invites
    const { data: invites } = await supabaseAdmin
      .from("team_invites")
      .select("id, email, status, created_at")
      .eq("team_id", teamId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      ok: true,
      teamId,
      teamName: team?.name ?? "My Team",
      role,
      members: membersWithEmail,
      invites: invites ?? [],
    });
  } catch (e: any) {
    console.error("GET /api/team/me failed:", e?.message ?? e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
