import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext, requireOwner } from "@/lib/teamAuth";
import { sendTeamInviteEmail, sendTeamJoinedEmail } from "@/lib/email";

export const runtime = "nodejs";

const MAX_MEMBERS = 5;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * POST /api/team/invite
 * Owner sends invite by email
 */
export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId, role } = result.ctx;
    const ownerCheck = requireOwner(role);
    if (ownerCheck) return ownerCheck;

    // Check team plan — only Team plan can invite members
    const { data: teamData } = await supabaseAdmin
      .from("teams")
      .select("plan, name")
      .eq("id", teamId)
      .single();

    if (teamData?.plan !== "team") {
      return jsonError("Upgrade to Team plan to invite members", 403);
    }

    const teamName = teamData.name || "ClipDash Team";

    // Get inviter's email for display in the invite email
    const { data: inviterData } = await supabaseAdmin.auth.admin.getUserById(result.ctx.userId);
    const inviterEmail = inviterData?.user?.email || "Your teammate";

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !email.includes("@")) {
      return jsonError("Please provide a valid email address");
    }

    // Count current members + pending invites
    const { count: memberCount } = await supabaseAdmin
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId);

    const { count: pendingCount } = await supabaseAdmin
      .from("team_invites")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("status", "pending");

    const total = (memberCount ?? 0) + (pendingCount ?? 0);
    if (total >= MAX_MEMBERS) {
      return jsonError(`Team is limited to ${MAX_MEMBERS} members`);
    }

    // Check if email is already a member
    const { data: existingMembers } = await supabaseAdmin
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId);

    for (const m of existingMembers ?? []) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
      if (userData?.user?.email?.toLowerCase() === email) {
        return jsonError("This person is already a team member");
      }
    }

    // Check if there's already a pending invite for this email
    const { data: existingInvite } = await supabaseAdmin
      .from("team_invites")
      .select("id")
      .eq("team_id", teamId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      return jsonError("An invite has already been sent to this email");
    }

    // Check if the email belongs to an existing user
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
    const matchedUser = (userList?.users ?? []).find(
      (u) => u.email?.toLowerCase() === email
    );

    if (matchedUser) {
      // User exists - add directly to team
      await supabaseAdmin.from("team_members").insert({
        team_id: teamId,
        user_id: matchedUser.id,
        role: "member",
      });

      // Clean up their old personal team (solo team where they're the only owner)
      const { data: oldMemberships } = await supabaseAdmin
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", matchedUser.id)
        .neq("team_id", teamId);

      for (const old of oldMemberships ?? []) {
        if (old.role !== "owner") continue;
        // Check if this team has other members
        const { count } = await supabaseAdmin
          .from("team_members")
          .select("id", { count: "exact", head: true })
          .eq("team_id", old.team_id);
        if ((count ?? 0) <= 1) {
          // Solo team — remove membership and delete team
          await supabaseAdmin
            .from("team_members")
            .delete()
            .eq("team_id", old.team_id)
            .eq("user_id", matchedUser.id);
          await supabaseAdmin
            .from("teams")
            .delete()
            .eq("id", old.team_id);
        }
      }

      await sendTeamJoinedEmail(email, inviterEmail, teamName);

      return NextResponse.json({
        ok: true,
        message: "User added to team",
        joined: true,
      });
    }

    // User doesn't exist yet - create pending invite
    const { error: inviteErr } = await supabaseAdmin.from("team_invites").insert({
      team_id: teamId,
      email,
      invited_by: result.ctx.userId,
    });

    if (inviteErr) {
      return jsonError(inviteErr.message, 500);
    }

    await sendTeamInviteEmail(email, inviterEmail, teamName);

    return NextResponse.json({
      ok: true,
      message: "Invite sent",
      joined: false,
    });
  } catch (e: any) {
    console.error("POST /api/team/invite failed:", e?.message ?? e);
    return jsonError(e?.message || "Server error", 500);
  }
}

/**
 * DELETE /api/team/invite
 * Owner removes a member or cancels a pending invite
 * Query params: ?userId=xxx or ?inviteId=xxx
 */
export async function DELETE(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId, role, userId: currentUserId } = result.ctx;
    const ownerCheck = requireOwner(role);
    if (ownerCheck) return ownerCheck;

    const url = new URL(req.url);
    const targetUserId = url.searchParams.get("userId");
    const inviteId = url.searchParams.get("inviteId");

    if (targetUserId) {
      // Cannot remove self (owner)
      if (targetUserId === currentUserId) {
        return jsonError("Cannot remove yourself as the team owner");
      }

      // Remove the member
      const { error: deleteErr } = await supabaseAdmin
        .from("team_members")
        .delete()
        .eq("team_id", teamId)
        .eq("user_id", targetUserId);

      if (deleteErr) {
        return jsonError(deleteErr.message, 500);
      }

      // Create a new personal team for the removed user
      const { data: newTeam } = await supabaseAdmin
        .from("teams")
        .insert({ name: "My Team", owner_id: targetUserId })
        .select("id")
        .single();

      if (newTeam) {
        await supabaseAdmin.from("team_members").insert({
          team_id: newTeam.id,
          user_id: targetUserId,
          role: "owner",
        });
      }

      return NextResponse.json({ ok: true, message: "Member removed" });
    }

    if (inviteId) {
      // Cancel a pending invite
      const { error: deleteErr } = await supabaseAdmin
        .from("team_invites")
        .delete()
        .eq("id", inviteId)
        .eq("team_id", teamId);

      if (deleteErr) {
        return jsonError(deleteErr.message, 500);
      }

      return NextResponse.json({ ok: true, message: "Invite cancelled" });
    }

    return jsonError("Provide userId or inviteId query parameter");
  } catch (e: any) {
    console.error("DELETE /api/team/invite failed:", e?.message ?? e);
    return jsonError(e?.message || "Server error", 500);
  }
}
