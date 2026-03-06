import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getXAuthConfig } from "@/lib/xUpload";
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      const desc = url.searchParams.get("error_description") || errorParam;
      return NextResponse.json({ ok: false, error: `X auth denied: ${desc}` }, { status: 400 });
    }

    if (!code || !state) {
      return NextResponse.json({ ok: false, error: "Missing code or state" }, { status: 400 });
    }

    // State format: "signedToken:codeVerifier"
    const lastColon = state.lastIndexOf(":");
    if (lastColon === -1) {
      return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
    }
    const signedToken = state.slice(0, lastColon);
    const codeVerifier = state.slice(lastColon + 1);
    if (!signedToken || !codeVerifier) {
      return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
    }

    const userId = verifyOAuthState(signedToken);

    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ ok: false, error: "No team found for user" }, { status: 403 });
    }

    const ownerCheck = requireOwnerOrAdmin(membership.role);
    if (ownerCheck) return ownerCheck;

    const teamId = membership.team_id;
    const { clientId, clientSecret, redirectUri } = getXAuthConfig();

    // Exchange code for tokens
    const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return NextResponse.json(
        { ok: false, error: `X token exchange failed: ${tokenRes.status} ${text}` },
        { status: 500 }
      );
    }

    const tokens = await tokenRes.json();
    if (tokens.error) {
      return NextResponse.json(
        { ok: false, error: `X error: ${tokens.error_description || tokens.error}` },
        { status: 400 }
      );
    }

    const accessToken: string = tokens.access_token;
    const refreshToken: string = tokens.refresh_token;
    const expiresIn: number = tokens.expires_in || 7200;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    if (!accessToken || !refreshToken) {
      return NextResponse.json({ ok: false, error: "X did not return tokens" }, { status: 400 });
    }

    // Fetch user profile
    let platformUserId: string | null = null;
    let profileName: string | null = null;
    let avatarUrl: string | null = null;

    try {
      const profileRes = await fetch(
        "https://api.x.com/2/users/me?user.fields=profile_image_url,name,username",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (profileRes.ok) {
        const profile = await profileRes.json();
        platformUserId = profile.data?.id ?? null;
        profileName = profile.data?.name || profile.data?.username || null;
        // Replace _normal with _400x400 for a larger avatar
        const rawAvatar: string | undefined = profile.data?.profile_image_url;
        avatarUrl = rawAvatar ? rawAvatar.replace("_normal", "_400x400") : null;
      }
    } catch {
      // Non-fatal
    }

    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "x",
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry: expiresAt,
        platform_user_id: platformUserId,
        profile_name: profileName,
        avatar_url: avatarUrl,
        label: profileName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider" }
    );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    const siteUrl = getSiteUrl(req);
    return NextResponse.redirect(`${siteUrl}/settings?connected=x`);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
