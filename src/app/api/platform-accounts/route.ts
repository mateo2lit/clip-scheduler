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
      .select("id, provider, created_at, updated_at, expiry, profile_name, avatar_url, label, page_id, ig_user_id")
      .eq("team_id", teamId);

    if (dbError) return jsonError(dbError.message, 500);

    // Return stable avatar URLs:
    // - Facebook: stable public Graph API picture URL (no signed tokens)
    // - Instagram/TikTok/LinkedIn/Bluesky: live endpoint that re-fetches with credentials server-side
    const accounts = (data ?? []).map(({ page_id, ig_user_id, ...acct }) => {
      if (acct.provider === "facebook" && page_id) {
        return { ...acct, avatar_url: `https://graph.facebook.com/${page_id}/picture?type=large` };
      }
      if (["instagram", "tiktok", "linkedin", "bluesky"].includes(acct.provider) && acct.id) {
        return { ...acct, avatar_url: `/api/avatar-live?id=${acct.id}` };
      }
      return acct;
    });

    return NextResponse.json({ ok: true, data: accounts });
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
    const accountId = url.searchParams.get("id");
    const provider = url.searchParams.get("provider"); // legacy fallback

    if (!accountId && !provider) {
      return jsonError("Missing id or provider query parameter", 400);
    }

    let deleteQuery = supabaseAdmin
      .from("platform_accounts")
      .delete()
      .eq("team_id", teamId);

    if (accountId) {
      deleteQuery = deleteQuery.eq("id", accountId);
    } else {
      // Legacy: provider-based delete (single-account, pre-migration)
      deleteQuery = deleteQuery.eq("provider", provider!.toLowerCase());
    }

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      return jsonError(deleteError.message, 500);
    }

    return NextResponse.json({ ok: true, message: `Disconnected ${accountId ?? provider}` });
  } catch (e: any) {
    console.error("DELETE /api/platform-accounts failed:", e?.message ?? e);
    return jsonError(e?.message ?? "Server error", 500);
  }
}
