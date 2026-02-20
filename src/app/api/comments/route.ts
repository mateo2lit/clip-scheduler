import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import {
  fetchYouTubeComments,
  fetchFacebookComments,
  fetchInstagramComments,
  type UnifiedComment,
} from "@/lib/commentFetchers";
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

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch recent platform posts live (no DB post storage)
    const [ytRecent, fbRecent, igRecent] = await Promise.all([
      acctMap.has("youtube") && acctMap.get("youtube")?.refresh_token
        ? fetchRecentYouTubePosts({
            refreshToken: acctMap.get("youtube").refresh_token,
            maxResults: 20,
            sinceIso: sevenDaysAgo,
          })
        : Promise.resolve({ posts: [] as any[], error: undefined as string | undefined }),
      acctMap.has("facebook") && acctMap.get("facebook")?.page_id && acctMap.get("facebook")?.page_access_token
        ? fetchRecentFacebookPosts({
            pageId: acctMap.get("facebook").page_id,
            pageAccessToken: acctMap.get("facebook").page_access_token,
            maxResults: 20,
            sinceIso: threeDaysAgo,
          })
        : Promise.resolve({ posts: [] as any[], error: undefined as string | undefined }),
      acctMap.has("instagram") && acctMap.get("instagram")?.ig_user_id && acctMap.get("instagram")?.access_token
        ? fetchRecentInstagramPosts({
            igUserId: acctMap.get("instagram").ig_user_id,
            accessToken: acctMap.get("instagram").access_token,
            maxResults: 20,
            sinceIso: threeDaysAgo,
          })
        : Promise.resolve({ posts: [] as any[], error: undefined as string | undefined }),
    ]);

    const ytPosts = ytRecent.posts;
    const fbPosts = fbRecent.posts;
    const igPosts = igRecent.posts;

    // Fetch comments from all platforms in parallel
    const errors: string[] = [];
    if (ytRecent.error) errors.push(ytRecent.error);
    if (fbRecent.error) errors.push(fbRecent.error);
    if (igRecent.error) errors.push(igRecent.error);

    const [ytResult, fbResult, igResult] = await Promise.allSettled([
      ytPosts.length > 0 && acctMap.has("youtube")
        ? fetchYouTubeComments(ytPosts, acctMap.get("youtube").refresh_token)
        : Promise.resolve({ comments: [] as UnifiedComment[], error: undefined as string | undefined }),
      fbPosts.length > 0 && acctMap.has("facebook")
        ? fetchFacebookComments(fbPosts, acctMap.get("facebook").page_access_token)
        : Promise.resolve({ comments: [] as UnifiedComment[], error: undefined as string | undefined }),
      igPosts.length > 0 && acctMap.has("instagram")
        ? fetchInstagramComments(
            igPosts,
            acctMap.get("instagram").access_token,
            acctMap.get("instagram").ig_user_id
          )
        : Promise.resolve({ comments: [] as UnifiedComment[], error: undefined as string | undefined }),
    ]);

    const allComments: UnifiedComment[] = [];

    for (const r of [ytResult, fbResult, igResult]) {
      if (r.status === "fulfilled") {
        allComments.push(...r.value.comments);
        if (r.value.error) errors.push(r.value.error);
      } else {
        errors.push(r.reason?.message || "Unknown fetch error");
      }
    }

    // Sort by most recent first
    allComments.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    // Temporary debug
    const debug = {
      accounts: Array.from(acctMap.keys()),
      ytPostCount: ytPosts.length,
      fbPostCount: fbPosts.length,
      igPostCount: igPosts.length,
      igPosts: igPosts.map((p: any) => ({ id: p.id, platform_post_id: p.platform_post_id, platform_media_id: p.platform_media_id })),
      hasIgAcct: acctMap.has("instagram"),
      igUserId: acctMap.get("instagram")?.ig_user_id ?? null,
    };

    return NextResponse.json({ ok: true, debug, errors, commentCount: allComments.length, comments: allComments });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
