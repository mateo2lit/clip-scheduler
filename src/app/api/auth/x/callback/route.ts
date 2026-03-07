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

    // Fetch user profile via /2/users/me
    // Try with profile_image_url first, fall back to basic fields only
    let platformUserId: string | null = null;
    let profileName: string | null = null;
    let avatarUrl: string | null = null;

    try {
      // Attempt 1: all fields including avatar
      const profileRes = await fetch(
        "https://api.x.com/2/users/me?user.fields=profile_image_url,name,username",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const profileText = await profileRes.text();
      let profile: any = null;
      try { profile = JSON.parse(profileText); } catch {}
      // Always log so we can see exactly what X returns
      console.log("[X callback] users/me status:", profileRes.status, "body:", profileText.slice(0, 500));

      if (profileRes.ok && profile?.data) {
        platformUserId = profile.data.id ?? null;
        profileName = profile.data.name || (profile.data.username ? `@${profile.data.username}` : null);
        const rawAvatar: string | undefined = profile.data.profile_image_url;
        avatarUrl = rawAvatar ? rawAvatar.replace("_normal", "_400x400") : null;
      } else {
        // Attempt 2: basic fields only (id, name, username are default)
        console.error("[X callback] profile fetch failed:", profileRes.status, profileText.slice(0, 300));
        const basicRes = await fetch(
          "https://api.x.com/2/users/me",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (basicRes.ok) {
          const basic = await basicRes.json();
          platformUserId = basic.data?.id ?? null;
          profileName = basic.data?.name || (basic.data?.username ? `@${basic.data.username}` : null);
        } else {
          console.error("[X callback] basic profile fetch also failed:", basicRes.status, await basicRes.text().catch(() => ""));
        }
      }
    } catch (e: any) {
      console.error("[X callback] profile fetch exception:", e?.message);
    }

    // Manual upsert: check for existing row then update or insert
    const { data: existing } = await supabaseAdmin
      .from("platform_accounts")
      .select("id")
      .eq("team_id", teamId)
      .eq("provider", "x")
      .maybeSingle();

    const accountData = {
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
    };

    let upsertErr: any = null;
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("platform_accounts")
        .update(accountData)
        .eq("id", existing.id);
      upsertErr = error;
    } else {
      const { error } = await supabaseAdmin
        .from("platform_accounts")
        .insert(accountData);
      upsertErr = error;
    }

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    const siteUrl = getSiteUrl(req);
    return NextResponse.redirect(`${siteUrl}/settings?connected=x`);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
