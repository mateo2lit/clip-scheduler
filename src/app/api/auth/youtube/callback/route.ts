import { NextResponse } from "next/server";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwnerOrAdmin } from "@/lib/teamAuth";
import { verifyOAuthState } from "@/lib/oauthState";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getSiteUrl(req: Request) {
  return (
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  );
}

function redirectError(req: Request, code: string): NextResponse {
  return NextResponse.redirect(`${getSiteUrl(req)}/settings?error=${code}`);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) return redirectError(req, "auth_denied");
    if (!code) return redirectError(req, "invalid");
    if (!state) return redirectError(req, "invalid");

    const userId = verifyOAuthState(state);

    // Look up team membership and verify owner role
    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!membership) return redirectError(req, "no_team");

    const ownerCheck = requireOwnerOrAdmin(membership.role);
    if (ownerCheck) return ownerCheck;

    const teamId = membership.team_id;

    const clientId = mustEnv("GOOGLE_CLIENT_ID");
    const clientSecret = mustEnv("GOOGLE_CLIENT_SECRET");

    const siteUrl = getSiteUrl(req);
    const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // 1) Exchange code for tokens
    const { tokens } = await oauth2.getToken(code);

    const accessToken = tokens.access_token ?? null;
    const newRefreshToken = tokens.refresh_token ?? null;
    const expiryIso =
      typeof tokens.expiry_date === "number" ? new Date(tokens.expiry_date).toISOString() : null;

    // 2) Fetch channel profile
    oauth2.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth: oauth2 });

    let channelId: string | null = null;
    let profileName: string | null = null;
    let avatarUrl: string | null = null;
    try {
      const channelRes = await youtube.channels.list({ part: ["snippet"], mine: true });
      const channel = channelRes.data.items?.[0];
      if (channel) {
        channelId = channel.id ?? null;
        if (channel.snippet) {
          profileName = channel.snippet.title ?? null;
          avatarUrl = channel.snippet.thumbnails?.default?.url ?? null;
        }
      }
    } catch (profileErr) {
      console.warn("Failed to fetch YouTube channel info:", profileErr);
    }

    if (!channelId) return redirectError(req, "no_youtube_channel");

    // 3) Read existing platform account for this specific channel to preserve refresh_token.
    const existing = await supabaseAdmin
      .from("platform_accounts")
      .select("id, refresh_token")
      .eq("team_id", teamId)
      .eq("provider", "youtube")
      .eq("platform_user_id", channelId)
      .maybeSingle();

    if (existing.error) return redirectError(req, "save_failed");

    const preservedRefreshToken = existing.data?.refresh_token ?? null;
    const refreshTokenToStore = newRefreshToken || preservedRefreshToken;

    if (!refreshTokenToStore) return redirectError(req, "no_refresh_token");

    // 4) Upsert platform_accounts.
    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "youtube",
        access_token: accessToken,
        refresh_token: refreshTokenToStore,
        expiry: expiryIso,
        platform_user_id: channelId,
        profile_name: profileName,
        avatar_url: avatarUrl,
        label: profileName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider,platform_user_id" }
    );

    if (upsertErr) return redirectError(req, "save_failed");

    const cookieStore = cookies();
    const inOnboarding = cookieStore.get("clip-onboarding")?.value === "1";
    const redirectPath = inOnboarding ? "/onboarding" : "/settings";
    const response = NextResponse.redirect(`${siteUrl}${redirectPath}?connected=youtube`);
    if (inOnboarding) {
      response.cookies.set("clip-onboarding", "", { maxAge: 0, path: "/" });
    }
    return response;
  } catch (e: any) {
    const msg = e?.message || "";
    if (msg.includes("expired")) return redirectError(req, "expired");
    if (msg.includes("OAuth state")) return redirectError(req, "invalid");
    return redirectError(req, "unknown");
  }
}
