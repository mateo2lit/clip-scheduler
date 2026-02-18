import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import {
  fetchYouTubeMetrics,
  fetchFacebookMetrics,
  fetchInstagramMetrics,
  type UnifiedMetric,
} from "@/lib/metricsFetchers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;

    // Load platform accounts for this team
    const { data: accounts } = await supabaseAdmin
      .from("platform_accounts")
      .select("provider, refresh_token, access_token, page_access_token, ig_user_id")
      .eq("team_id", teamId)
      .in("provider", ["youtube", "facebook", "instagram"]);

    const acctMap = new Map<string, any>();
    for (const a of accounts ?? []) {
      acctMap.set(a.provider, a);
    }

    // Fetch posted posts per platform
    const [ytPosts, fbPosts, igPosts] = await Promise.all([
      acctMap.has("youtube")
        ? supabaseAdmin
            .from("scheduled_posts")
            .select("id, title, platform_post_id, posted_at")
            .eq("team_id", teamId)
            .eq("provider", "youtube")
            .eq("status", "posted")
            .not("platform_post_id", "is", null)
            .order("posted_at", { ascending: false })
            .limit(50)
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      acctMap.has("facebook")
        ? supabaseAdmin
            .from("scheduled_posts")
            .select("id, title, platform_post_id, posted_at")
            .eq("team_id", teamId)
            .eq("provider", "facebook")
            .eq("status", "posted")
            .not("platform_post_id", "is", null)
            .order("posted_at", { ascending: false })
            .limit(50)
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      acctMap.has("instagram")
        ? supabaseAdmin
            .from("scheduled_posts")
            .select("id, title, platform_post_id, platform_media_id, posted_at")
            .eq("team_id", teamId)
            .eq("provider", "instagram")
            .eq("status", "posted")
            .not("platform_post_id", "is", null)
            .order("posted_at", { ascending: false })
            .limit(50)
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
    ]);

    // Fetch metrics from all platforms in parallel
    const errors: string[] = [];

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

    return NextResponse.json({ ok: true, errors, metrics: allMetrics, totals });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
