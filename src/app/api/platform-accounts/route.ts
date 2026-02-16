// src/app/api/platform-accounts/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext, requireOwnerOrAdmin } from "@/lib/teamAuth";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;

    const { data, error: dbError } = await supabaseAdmin
      .from("platform_accounts")
      .select("provider, created_at, updated_at, expiry, profile_name, avatar_url")
      .eq("team_id", teamId);

    if (dbError) return jsonError(dbError.message, 500);

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    console.error("GET /api/platform-accounts failed:", e?.message ?? e);
    return jsonError(e?.message ?? "Server error", 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId, role } = result.ctx;

    // Only owners and admins can disconnect platforms
    const ownerCheck = requireOwnerOrAdmin(role);
    if (ownerCheck) return ownerCheck;

    const url = new URL(req.url);
    const provider = url.searchParams.get("provider");

    if (!provider) {
      return jsonError("Missing provider query parameter", 400);
    }

    const { error: deleteError } = await supabaseAdmin
      .from("platform_accounts")
      .delete()
      .eq("team_id", teamId)
      .eq("provider", provider.toLowerCase());

    if (deleteError) {
      return jsonError(deleteError.message, 500);
    }

    return NextResponse.json({ ok: true, message: `Disconnected ${provider}` });
  } catch (e: any) {
    console.error("DELETE /api/platform-accounts failed:", e?.message ?? e);
    return jsonError(e?.message ?? "Server error", 500);
  }
}
