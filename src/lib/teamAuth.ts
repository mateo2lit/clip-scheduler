import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TeamContext = {
  userId: string;
  teamId: string;
  role: "owner" | "member" | "admin";
};

type TeamContextResult =
  | { ok: true; ctx: TeamContext }
  | { ok: false; error: NextResponse };

export async function getTeamContext(req: Request): Promise<TeamContextResult> {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token) {
    return {
      ok: false,
      error: NextResponse.json(
        { ok: false, error: "Missing Authorization token" },
        { status: 401 }
      ),
    };
  }

  const { data: userData, error: userErr } =
    await supabaseAdmin.auth.getUser(token);

  if (userErr || !userData?.user?.id) {
    return {
      ok: false,
      error: NextResponse.json(
        { ok: false, error: "Invalid or expired session" },
        { status: 401 }
      ),
    };
  }

  const userId = userData.user.id;

  const { data: membership, error: memberErr } = await supabaseAdmin
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (memberErr || !membership) {
    return {
      ok: false,
      error: NextResponse.json(
        { ok: false, error: "No team found for user" },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      userId,
      teamId: membership.team_id,
      role: membership.role as "owner" | "member" | "admin",
    },
  };
}

export function requireOwner(role: string): NextResponse | null {
  if (role !== "owner") {
    return NextResponse.json(
      { ok: false, error: "Only the team owner can perform this action" },
      { status: 403 }
    );
  }
  return null;
}

export function requireOwnerOrAdmin(role: string): NextResponse | null {
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Only owners and admins can perform this action" },
      { status: 403 }
    );
  }
  return null;
}
