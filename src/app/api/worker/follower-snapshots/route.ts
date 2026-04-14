import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchPublicProfile } from "@/lib/competitorFetchers";

export const runtime = "nodejs";
export const maxDuration = 300;

function requireWorkerAuth(req: Request): boolean {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token") || "";
  const secret = process.env.WORKER_SECRET || process.env.CRON_SECRET || "";
  return secret !== "" && (token === secret || queryToken === secret);
}

async function fetchYouTubeFollowers(refreshToken: string): Promise<number | null> {
  try {
    // Refresh access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return null;

    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const data = await res.json();
    const count = data.items?.[0]?.statistics?.subscriberCount;
    return count ? parseInt(count, 10) : null;
  } catch {
    return null;
  }
}

async function fetchTikTokFollowers(accessToken: string): Promise<number | null> {
  try {
    const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=follower_count", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    return data.data?.user?.follower_count ?? null;
  } catch {
    return null;
  }
}

async function fetchInstagramFollowers(igUserId: string, accessToken: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}?fields=followers_count&access_token=${accessToken}`
    );
    const data = await res.json();
    return data.followers_count ?? null;
  } catch {
    return null;
  }
}

async function fetchFacebookFollowers(pageId: string, pageAccessToken: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=followers_count&access_token=${pageAccessToken}`
    );
    const data = await res.json();
    return data.followers_count ?? null;
  } catch {
    return null;
  }
}

async function fetchBlueskyFollowers(did: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`
    );
    const data = await res.json();
    return data.followersCount ?? null;
  } catch {
    return null;
  }
}

async function fetchXFollowers(accessToken: string, platformUserId: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.x.com/2/users/${platformUserId}?user.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    return data.data?.public_metrics?.followers_count ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!requireWorkerAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all platform accounts
    const { data: accounts, error: acctErr } = await supabaseAdmin
      .from("platform_accounts")
      .select("id, team_id, provider, refresh_token, access_token, page_id, page_access_token, ig_user_id, platform_user_id")
      .in("provider", ["youtube", "tiktok", "instagram", "facebook", "bluesky", "x"]);

    if (acctErr || !accounts) {
      return NextResponse.json({ ok: false, error: acctErr?.message || "No accounts found" });
    }

    const results: { account: string; provider: string; followers: number | null }[] = [];

    for (const acct of accounts) {
      let followers: number | null = null;

      switch (acct.provider) {
        case "youtube":
          if (acct.refresh_token) followers = await fetchYouTubeFollowers(acct.refresh_token);
          break;
        case "tiktok":
          if (acct.access_token) followers = await fetchTikTokFollowers(acct.access_token);
          break;
        case "instagram":
          if (acct.ig_user_id && acct.access_token) followers = await fetchInstagramFollowers(acct.ig_user_id, acct.access_token);
          break;
        case "facebook":
          if (acct.page_id && acct.page_access_token) followers = await fetchFacebookFollowers(acct.page_id, acct.page_access_token);
          break;
        case "bluesky":
          if (acct.platform_user_id) followers = await fetchBlueskyFollowers(acct.platform_user_id);
          break;
        case "x":
          if (acct.access_token && acct.platform_user_id) followers = await fetchXFollowers(acct.access_token, acct.platform_user_id);
          break;
      }

      if (followers !== null) {
        // Upsert snapshot (one per account per day)
        await supabaseAdmin
          .from("follower_snapshots")
          .upsert(
            {
              team_id: acct.team_id,
              platform_account_id: acct.id,
              provider: acct.provider,
              follower_count: followers,
              snapshot_date: new Date().toISOString().split("T")[0],
            },
            { onConflict: "platform_account_id,snapshot_date" }
          );
      }

      results.push({ account: acct.id, provider: acct.provider, followers });
    }

    // Also snapshot competitors — fetch latest public profile and record a snapshot
    const { data: competitors } = await supabaseAdmin
      .from("competitor_profiles")
      .select("id, platform, handle");

    const today = new Date().toISOString().split("T")[0];
    const competitorResults: { id: string; platform: string; followers: number | null }[] = [];

    for (const comp of competitors || []) {
      const profile = await fetchPublicProfile(comp.platform, comp.handle);
      if (profile) {
        // Update current profile stats
        await supabaseAdmin
          .from("competitor_profiles")
          .update({
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            follower_count: profile.follower_count,
            following_count: profile.following_count,
            post_count: profile.post_count,
            last_fetched_at: new Date().toISOString(),
          })
          .eq("id", comp.id);

        // Record daily snapshot
        await supabaseAdmin.from("competitor_snapshots").upsert(
          {
            competitor_id: comp.id,
            follower_count: profile.follower_count,
            post_count: profile.post_count,
            snapshot_date: today,
          },
          { onConflict: "competitor_id,snapshot_date" }
        );
      }
      competitorResults.push({ id: comp.id, platform: comp.platform, followers: profile?.follower_count ?? null });
    }

    return NextResponse.json({
      ok: true,
      accounts: results.length,
      competitors: competitorResults.length,
      results,
      competitorResults,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
