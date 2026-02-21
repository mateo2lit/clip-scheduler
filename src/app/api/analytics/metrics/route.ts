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

    // Load platform accounts for this team
    const { data: accounts } = await supabaseAdmin
      .from("platform_accounts")
      .select("provider, refresh_token, access_token, page_id, page_access_token, ig_user_id")
      .eq("team_id", teamId)
      .in("provider", ["youtube", "facebook", "instagram"]);

    const acctMap = new Map<string, any>();
    for (const a of accounts ?? []) {
      acctMap.set(a.provider, a);
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

    // Fetch recent platform posts live (no DB post storage)
    const [ytRecent, fbRecent, igRecent] = await Promise.all([
      acctMap.has("youtube") && acctMap.get("youtube")?.refresh_token
        ? fetchRecentYouTubePosts({
            refreshToken: acctMap.get("youtube").refresh_token,
            maxResults,
            sinceIso,
          })
        : Promise.resolve({ posts: [] as any[], error: undefined as string | undefined }),
      acctMap.has("facebook") && acctMap.get("facebook")?.page_id && acctMap.get("facebook")?.page_access_token
        ? fetchRecentFacebookPosts({
            pageId: acctMap.get("facebook").page_id,
            pageAccessToken: acctMap.get("facebook").page_access_token,
            maxResults,
            sinceIso,
          })
        : Promise.resolve({ posts: [] as any[], error: undefined as string | undefined }),
      acctMap.has("instagram") && acctMap.get("instagram")?.ig_user_id && acctMap.get("instagram")?.access_token
        ? fetchRecentInstagramPosts({
            igUserId: acctMap.get("instagram").ig_user_id,
            accessToken: acctMap.get("instagram").access_token,
            maxResults,
            sinceIso,
          })
        : Promise.resolve({ posts: [] as any[], error: undefined as string | undefined }),
    ]);

    const ytPosts = ytRecent.posts;
    const fbPosts = fbRecent.posts;
    const igPosts = igRecent.posts;

    // Fetch metrics from all platforms in parallel
    const errors: string[] = [];
    if (ytRecent.error) errors.push(ytRecent.error);
    if (fbRecent.error) errors.push(fbRecent.error);
    if (igRecent.error) errors.push(igRecent.error);

    const [ytResult, fbResult, igResult] = await Promise.allSettled([
      ytPosts.length > 0 && acctMap.has("youtube")
        ? fetchYouTubeMetrics(ytPosts, acctMap.get("youtube").refresh_token)
        : Promise.resolve({ metrics: [] as UnifiedMetric[], error: undefined as string | undefined }),
      fbPosts.length > 0 && acctMap.has("facebook")
        ? fetchFacebookMetrics(fbPosts, acctMap.get("facebook").page_access_token)
        : Promise.resolve({ metrics: [] as UnifiedMetric[], error: undefined as string | undefined }),
      igPosts.length > 0 && acctMap.has("instagram")
        ? fetchInstagramMetrics(igPosts, acctMap.get("instagram").access_token)
        : Promise.resolve({ metrics: [] as UnifiedMetric[], error: undefined as string | undefined }),
    ]);

    const allMetrics: UnifiedMetric[] = [];

    for (const r of [ytResult, fbResult, igResult]) {
      if (r.status === "fulfilled") {
        allMetrics.push(...r.value.metrics);
        if (r.value.error) errors.push(r.value.error);
      } else {
        errors.push(r.reason?.message || "Unknown fetch error");
      }
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
