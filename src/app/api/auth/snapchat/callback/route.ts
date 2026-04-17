import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwnerOrAdmin } from "@/lib/teamAuth";
import { verifyOAuthState } from "@/lib/oauthState";

export const runtime = "nodejs";

function getSiteUrl(req: Request) {
  return (
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  );
}

function redirectError(req: Request, code: string) {
  return NextResponse.redirect(`${getSiteUrl(req)}/settings?error=${code}`);
}

function getSnapchatConfig(siteUrl: string) {
  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing Snapchat env vars");
  return {
    clientId,
    clientSecret,
    redirectUri: `${siteUrl}/api/auth/snapchat/callback`,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) return redirectError(req, "auth_denied");
    if (!code || !state) return redirectError(req, "invalid");

    const userId = verifyOAuthState(state);

    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!membership) return redirectError(req, "no_team");
    const ownerCheckResult = requireOwnerOrAdmin(membership.role);
    if (ownerCheckResult) return ownerCheckResult;

    const teamId = membership.team_id;
    const siteUrl = getSiteUrl(req);
    const { clientId, clientSecret, redirectUri } = getSnapchatConfig(siteUrl);

    // Exchange code for token
    const tokenRes = await fetch("https://accounts.snapchat.com/login/oauth2/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Snapchat token exchange failed: ${tokenRes.status} ${text}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token as string;
    const refreshToken = (tokenData.refresh_token ?? null) as string | null;
    const expiresIn = (tokenData.expires_in ?? 3600) as number;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Fetch user profile
    const meRes = await fetch("https://kit.snapchat.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let snapUserId = userId;
    let displayName = "Snapchat User";
    let avatarUrl: string | null = null;

    if (meRes.ok) {
      const me = await meRes.json();
      snapUserId = me.data?.me?.externalId ?? userId;
      displayName = me.data?.me?.displayName ?? "Snapchat User";
      avatarUrl = me.data?.me?.bitmoji?.avatarImage?.url ?? null;
    }

    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "snapchat",
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry: expiresAt,
        platform_user_id: snapUserId,
        profile_name: displayName,
        avatar_url: avatarUrl,
        label: displayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider,platform_user_id" }
    );

    if (upsertErr) return redirectError(req, "save_failed");

    return NextResponse.redirect(`${siteUrl}/settings?connected=snapchat`);
  } catch (e: any) {
    const msg = e?.message || "";
    if (msg.includes("expired")) return redirectError(req, "expired");
    if (msg.includes("OAuth state")) return redirectError(req, "invalid");
    return redirectError(req, "unknown");
  }
}
