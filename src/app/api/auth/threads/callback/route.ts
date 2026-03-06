import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getThreadsAuthConfig,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getThreadsProfile,
} from "@/lib/threads";
import { requireOwnerOrAdmin } from "@/lib/teamAuth";
import { verifyOAuthState } from "@/lib/oauthState";
import { isThreadsEnabledForUserId } from "@/lib/platformAccess";

export const runtime = "nodejs";

function getSiteUrl(req: Request) {
  return (
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      const errorDesc = url.searchParams.get("error_description") || errorParam;
      return NextResponse.json({ ok: false, error: `Threads auth denied: ${errorDesc}` }, { status: 400 });
    }

    if (!code) return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
    if (!state) return NextResponse.json({ ok: false, error: "Missing state" }, { status: 400 });

    const userId = verifyOAuthState(state);

    if (!isThreadsEnabledForUserId(userId)) {
      return NextResponse.json(
        { ok: false, error: "Threads is not available for this account." },
        { status: 403 }
      );
    }

    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ ok: false, error: "No team found for user" }, { status: 403 });
    }

    const ownerCheckResult = requireOwnerOrAdmin(membership.role);
    if (ownerCheckResult) return ownerCheckResult;

    const teamId = membership.team_id;
    const { redirectUri } = getThreadsAuthConfig();

    const shortLived = await exchangeCodeForToken(code, redirectUri);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const longLivedToken = longLived.access_token;
    const expiresAt = new Date(Date.now() + longLived.expires_in * 1000).toISOString();

    const profile = await getThreadsProfile(longLivedToken);
    const threadsUserId = profile.id;
    const profileName = profile.username || null;
    const avatarUrl = profile.profilePictureUrl || null;

    // onConflict uses "team_id,provider,platform_user_id" after the multi-channel DB migration.
    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "threads",
        access_token: longLivedToken,
        refresh_token: longLivedToken,
        expiry: expiresAt,
        platform_user_id: threadsUserId,
        ig_user_id: threadsUserId,
        profile_name: profileName,
        avatar_url: avatarUrl,
        label: profileName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider,platform_user_id" }
    );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    const siteUrl = getSiteUrl(req);
    return NextResponse.redirect(`${siteUrl}/settings?connected=threads`);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
