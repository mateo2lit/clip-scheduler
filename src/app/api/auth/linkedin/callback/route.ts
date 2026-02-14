import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getLinkedInAuthConfig,
  exchangeCodeForToken,
  getLinkedInProfile,
} from "@/lib/linkedin";
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
        { ok: false, error: `LinkedIn auth denied: ${errorDesc}` },
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
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ ok: false, error: "No team found for user" }, { status: 403 });
    }

    const ownerCheckResult = requireOwner(membership.role);
    if (ownerCheckResult) return ownerCheckResult;

    const teamId = membership.team_id;

    const { redirectUri } = getLinkedInAuthConfig();

    // 1) Exchange code for access token
    const tokenData = await exchangeCodeForToken(code, redirectUri);
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 2) Fetch user profile
    const profile = await getLinkedInProfile(accessToken);

    // 3) Upsert platform_accounts with provider="linkedin"
    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "linkedin",
        access_token: accessToken,
        refresh_token: accessToken, // LinkedIn access tokens are long-lived (60 days)
        expiry: expiresAt,
        platform_user_id: profile.sub,
        profile_name: profile.name,
        avatar_url: profile.picture,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider" }
    );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    const siteUrl = getSiteUrl(req);
    return NextResponse.redirect(`${siteUrl}/settings?connected=linkedin`);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
