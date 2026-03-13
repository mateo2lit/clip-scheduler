import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import {
  fetchYouTubeMetrics,
  fetchFacebookMetrics,
  fetchInstagramMetrics,
  fetchBlueskyMetrics,
  fetchTikTokMetrics,
  type UnifiedMetric,
} from "@/lib/metricsFetchers";
import {
  fetchRecentYouTubePosts,
  fetchRecentFacebookPosts,
  fetchRecentInstagramPosts,
  fetchRecentBlueskyPosts,
} from "@/lib/recentPlatformPosts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;

    // Load all platform accounts for this team, grouped by provider
    const { data: accounts } = await supabaseAdmin
      .from("platform_accounts")
      .select("id, provider, refresh_token, access_token, page_id, page_access_token, ig_user_id, platform_user_id")
      .eq("team_id", teamId)
      .in("provider", ["youtube", "facebook", "instagram", "bluesky", "tiktok"]);

    const acctsByProvider = new Map<string, any[]>();
    for (const a of accounts ?? []) {
      if (!acctsByProvider.has(a.provider)) acctsByProvider.set(a.provider, []);
      acctsByProvider.get(a.provider)!.push(a);
    }

    const url = new URL(req.url);
    const range = (url.searchParams.get("range") || "1w").toLowerCase();
    const now = Date.now();
    const rangeMs: Record<string, number> = {
      "24h": 24 * 60 * 60 * 1000,
      "1w": 7 * 24 * 60 * 60 * 1000,
      "1m": 30 * 24 * 60 * 60 * 1000,
      "1y": 365 * 24 * 60 * 60 * 1000,
    };
    const windowMs = rangeMs[range] ?? rangeMs["1w"];
    const sinceIso = new Date(now - windowMs).toISOString();
    const maxResultsByRange: Record<string, number> = {
      "24h": 25,
      "1w": 50,
      "1m": 100,
      "1y": 200,
    };
    const maxResults = maxResultsByRange[range] ?? 50;

    const errors: string[] = [];
    const allMetrics: UnifiedMetric[] = [];

    // Fetch from all YouTube accounts
    const ytResults = await Promise.allSettled(
      (acctsByProvider.get("youtube") ?? [])
        .filter((a) => a.refresh_token)
        .map(async (a) => {
          const recent = await fetchRecentYouTubePosts({ refreshToken: a.refresh_token, maxResults, sinceIso });
          if (recent.error) errors.push(recent.error);
          if (recent.posts.length === 0) return [] as UnifiedMetric[];
          const r = await fetchYouTubeMetrics(recent.posts, a.refresh_token);
          if (r.error) errors.push(r.error);
          return r.metrics;
        })
    );
    for (const r of ytResults) {
      if (r.status === "fulfilled") allMetrics.push(...r.value);
      else errors.push(r.reason?.message || "YouTube fetch error");
    }

    // Fetch from all Facebook accounts
    const fbResults = await Promise.allSettled(
      (acctsByProvider.get("facebook") ?? [])
        .filter((a) => a.page_id && a.page_access_token)
        .map(async (a) => {
          const recent = await fetchRecentFacebookPosts({ pageId: a.page_id, pageAccessToken: a.page_access_token, maxResults, sinceIso });
          if (recent.error) errors.push(recent.error);
          if (recent.posts.length === 0) return [] as UnifiedMetric[];
          const r = await fetchFacebookMetrics(recent.posts, a.page_access_token);
          if (r.error) errors.push(r.error);
          return r.metrics;
        })
    );
    for (const r of fbResults) {
      if (r.status === "fulfilled") allMetrics.push(...r.value);
      else errors.push(r.reason?.message || "Facebook fetch error");
    }

    // Fetch from all Instagram accounts
    const igResults = await Promise.allSettled(
      (acctsByProvider.get("instagram") ?? [])
        .filter((a) => a.ig_user_id && a.access_token)
        .map(async (a) => {
          const recent = await fetchRecentInstagramPosts({ igUserId: a.ig_user_id, accessToken: a.access_token, maxResults, sinceIso });
          if (recent.error) errors.push(recent.error);
          if (recent.posts.length === 0) return [] as UnifiedMetric[];
          const r = await fetchInstagramMetrics(recent.posts, a.access_token);
          if (r.error) errors.push(r.error);
          return r.metrics;
        })
    );
    for (const r of igResults) {
      if (r.status === "fulfilled") allMetrics.push(...r.value);
      else errors.push(r.reason?.message || "Instagram fetch error");
    }

    // Fetch from all TikTok accounts — use our DB for the post list, TikTok API for stats
    const ttResults = await Promise.allSettled(
      (acctsByProvider.get("tiktok") ?? [])
        .filter((a) => a.access_token)
        .map(async (a) => {
          const { data: ttPosts } = await supabaseAdmin
            .from("scheduled_posts")
            .select("id, title, platform_post_id, posted_at")
            .eq("team_id", teamId)
            .eq("provider", "tiktok")
            .eq("status", "posted")
            .eq("platform_account_id", a.id)
            .gte("posted_at", sinceIso)
            .order("posted_at", { ascending: false })
            .limit(maxResults);

          if (!ttPosts || ttPosts.length === 0) return [] as UnifiedMetric[];

          const posts = ttPosts.map((p) => ({
            id: p.id,
            title: p.title,
            platform_post_id: p.platform_post_id,
            posted_at: p.posted_at,
          }));

          const r = await fetchTikTokMetrics(posts, a.access_token);
          if (r.error) errors.push(r.error);
          return r.metrics;
        })
    );
    for (const r of ttResults) {
      if (r.status === "fulfilled") allMetrics.push(...r.value);
      else errors.push(r.reason?.message || "TikTok fetch error");
    }

    // Fetch from all Bluesky accounts
    const bskyResults = await Promise.allSettled(
      (acctsByProvider.get("bluesky") ?? [])
        .filter((a) => a.platform_user_id)
        .map(async (a) => {
          const recent = await fetchRecentBlueskyPosts({ did: a.platform_user_id, maxResults, sinceIso });
          if (recent.error) errors.push(recent.error);
          if (recent.posts.length === 0) return [] as UnifiedMetric[];
          const r = await fetchBlueskyMetrics(recent.posts);
          if (r.error) errors.push(r.error);
          return r.metrics;
        })
    );
    for (const r of bskyResults) {
      if (r.status === "fulfilled") allMetrics.push(...r.value);
      else errors.push(r.reason?.message || "Bluesky fetch error");
    }

    // Sort by most recent first
    allMetrics.sort(
      (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
    );

    const totals = {
      views: allMetrics.reduce((sum, m) => sum + m.views, 0),
      likes: allMetrics.reduce((sum, m) => sum + m.likes, 0),
      comments: allMetrics.reduce((sum, m) => sum + m.comments, 0),
    };

    return NextResponse.json({ ok: true, errors, range, metrics: allMetrics, totals });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
