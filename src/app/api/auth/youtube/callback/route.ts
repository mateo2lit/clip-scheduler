import { NextResponse } from "next/server";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwnerOrAdmin } from "@/lib/teamAuth";
import { verifyOAuthState } from "@/lib/oauthState";

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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code) {
      return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
    }

    if (!state) {
      return NextResponse.json({ ok: false, error: "Missing state" }, { status: 400 });
    }

    const userId = verifyOAuthState(state);

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

    // 2) Fetch channel profile — we need channelId to scope the refresh_token lookup
    //    so we move this before the existing-account lookup.
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

    // 3) Read existing platform account for this specific channel to preserve refresh_token.
    //    Scope by platform_user_id (channelId) so we don't interfere with other connected channels.
    const existingQuery = supabaseAdmin
      .from("platform_accounts")
      .select("id, refresh_token")
      .eq("team_id", teamId)
      .eq("provider", "youtube");

    const existing = channelId
      ? await existingQuery.eq("platform_user_id", channelId).maybeSingle()
      : await existingQuery.maybeSingle();

    if (existing.error) {
      return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
    }

    const preservedRefreshToken = existing.data?.refresh_token ?? null;
    const refreshTokenToStore = newRefreshToken || preservedRefreshToken;

    if (!refreshTokenToStore) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No refresh_token available. Please revoke Clip Scheduler access in your Google Account security settings and reconnect.",
        },
        { status: 400 }
      );
    }

    // 4) Upsert platform_accounts.
    //    onConflict uses "team_id,provider,platform_user_id" — requires the unique constraint
    //    added in the multi-channel DB migration. Until that migration runs, this uses
    //    "team_id,provider" as the fallback conflict target.
    const conflictTarget = channelId ? "team_id,provider,platform_user_id" : "team_id,provider";

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
      { onConflict: conflictTarget }
    );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.redirect(`${siteUrl}/settings?connected=youtube`);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
