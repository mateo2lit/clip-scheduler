import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getInstagramAuthConfig,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getInstagramProfile,
} from "@/lib/instagram";
import { requireOwner } from "@/lib/teamAuth";

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
    const userId = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      const errorDesc = url.searchParams.get("error_description") || errorParam;
      return NextResponse.json(
        { ok: false, error: `Instagram auth denied: ${errorDesc}` },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Missing state (user id)" }, { status: 400 });
    }

    // Look up team membership and verify owner role
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

    const ownerCheckResult = requireOwner(membership.role);
    if (ownerCheckResult) return ownerCheckResult;

    const teamId = membership.team_id;
    const { redirectUri } = getInstagramAuthConfig();

    // 1) Exchange code for short-lived token via Instagram API
    const shortLived = await exchangeCodeForToken(code, redirectUri);

    // 2) Exchange for long-lived token (~60 days)
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const longLivedToken = longLived.access_token;
    const expiresAt = new Date(Date.now() + longLived.expires_in * 1000).toISOString();

    // 3) Fetch Instagram profile info — use the Graph API `id` for content publishing
    const profile = await getInstagramProfile(longLivedToken);
    const igUserId = profile.id; // Graph API IG User ID (needed for /media and /media_publish)
    const profileName = profile.username || null;
    const avatarUrl = profile.profilePictureUrl || null;

    // 4) Upsert platform_accounts with provider="instagram"
    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "instagram",
        access_token: longLivedToken,
        refresh_token: longLivedToken,
        expiry: expiresAt,
        platform_user_id: igUserId,
        ig_user_id: igUserId,
        profile_name: profileName,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider" }
    );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    const siteUrl = getSiteUrl(req);
    return NextResponse.redirect(`${siteUrl}/settings?connected=instagram`);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
