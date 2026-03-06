import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import {
  fetchYouTubeMetrics,
  fetchFacebookMetrics,
  fetchInstagramMetrics,
  type UnifiedMetric,
} from "@/lib/metricsFetchers";
import {
  fetchRecentYouTubePosts,
  fetchRecentFacebookPosts,
  fetchRecentInstagramPosts,
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
      .select("id, provider, refresh_token, access_token, page_id, page_access_token, ig_user_id")
      .eq("team_id", teamId)
      .in("provider", ["youtube", "facebook", "instagram"]);

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
