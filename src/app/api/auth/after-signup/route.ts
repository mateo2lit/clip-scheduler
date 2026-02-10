import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing Authorization token" },
        { status: 401 }
      );
    }

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);

    if (userErr || !userData?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;

    // Idempotent: if user already has a team_members row, return early
    const { data: existing } = await supabaseAdmin
      .from("team_members")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, message: "Already has team" });
    }

    // Check for pending invites matching this user's email
    if (userEmail) {
      const { data: invite } = await supabaseAdmin
        .from("team_invites")
        .select("id, team_id")
        .eq("email", userEmail.toLowerCase())
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();

      if (invite) {
        // Add user to the inviting team as member
        await supabaseAdmin.from("team_members").insert({
          team_id: invite.team_id,
          user_id: userId,
          role: "member",
        });

        // Mark invite as accepted
        await supabaseAdmin
          .from("team_invites")
          .update({ status: "accepted" })
          .eq("id", invite.id);

        return NextResponse.json({ ok: true, message: "Joined team via invite" });
      }
    }

    // No invite found: create a new personal team
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .insert({ name: "My Team", owner_id: userId })
      .select("id")
      .single();

    if (teamErr || !team) {
      return NextResponse.json(
        { ok: false, error: teamErr?.message || "Failed to create team" },
        { status: 500 }
      );
    }

    // Add user as owner
    await supabaseAdmin.from("team_members").insert({
      team_id: team.id,
      user_id: userId,
      role: "owner",
    });

    return NextResponse.json({ ok: true, message: "Team created" });
  } catch (e: any) {
    console.error("POST /api/auth/after-signup failed:", e?.message ?? e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
