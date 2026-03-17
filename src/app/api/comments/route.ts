import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import {
  fetchYouTubeComments,
  fetchFacebookComments,
  fetchInstagramComments,
  fetchBlueskyComments,
  type UnifiedComment,
} from "@/lib/commentFetchers";
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
      .select("id, provider, refresh_token, access_token, page_id, page_access_token, ig_user_id, platform_user_id, profile_name, label")
      .eq("team_id", teamId)
      .in("provider", ["youtube", "facebook", "instagram", "bluesky", "tiktok"]);

    const acctsByProvider = new Map<string, any[]>();
    for (const a of accounts ?? []) {
      if (!acctsByProvider.has(a.provider)) acctsByProvider.set(a.provider, []);
      acctsByProvider.get(a.provider)!.push(a);
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const errors: string[] = [];
    const allComments: UnifiedComment[] = [];

    // Fetch from all YouTube accounts
    const ytResults = await Promise.allSettled(
      (acctsByProvider.get("youtube") ?? [])
        .filter((a) => a.refresh_token)
        .map(async (a) => {
          const label = a.profile_name || a.label || "YouTube";
          const recent = await fetchRecentYouTubePosts({ refreshToken: a.refresh_token, maxResults: 20, sinceIso: sevenDaysAgo });
          if (recent.error) errors.push(recent.error);
          if (recent.posts.length === 0) return [] as UnifiedComment[];
          const r = await fetchYouTubeComments(recent.posts, a.refresh_token, a.id, label);
          if (r.error) errors.push(r.error);
          return r.comments;
        })
    );
    for (const r of ytResults) {
      if (r.status === "fulfilled") allComments.push(...r.value);
      else errors.push(r.reason?.message || "YouTube comment fetch error");
    }

    // Fetch from all Facebook accounts
    const fbResults = await Promise.allSettled(
      (acctsByProvider.get("facebook") ?? [])
        .filter((a) => a.page_id && a.page_access_token)
        .map(async (a) => {
          const label = a.profile_name || a.label || "Facebook";
          const recent = await fetchRecentFacebookPosts({ pageId: a.page_id, pageAccessToken: a.page_access_token, maxResults: 20, sinceIso: threeDaysAgo });
          if (recent.error) errors.push(recent.error);
          if (recent.posts.length === 0) return [] as UnifiedComment[];
          const r = await fetchFacebookComments(recent.posts, a.page_access_token, a.id, label);
          if (r.error) errors.push(r.error);
          return r.comments;
        })
    );
    for (const r of fbResults) {
      if (r.status === "fulfilled") allComments.push(...r.value);
      else errors.push(r.reason?.message || "Facebook comment fetch error");
    }

    // Fetch from all Instagram accounts
    const igResults = await Promise.allSettled(
      (acctsByProvider.get("instagram") ?? [])
        .filter((a) => a.ig_user_id && a.access_token)
        .map(async (a) => {
          const label = a.profile_name || a.label || "Instagram";
          const recent = await fetchRecentInstagramPosts({ igUserId: a.ig_user_id, accessToken: a.access_token, maxResults: 20, sinceIso: threeDaysAgo });
          if (recent.error) errors.push(recent.error);
          if (recent.posts.length === 0) return [] as UnifiedComment[];
          const r = await fetchInstagramComments(recent.posts, a.access_token, a.ig_user_id, a.id, label);
          if (r.error) errors.push(r.error);
          return r.comments;
        })
    );
    for (const r of igResults) {
      if (r.status === "fulfilled") allComments.push(...r.value);
      else errors.push(r.reason?.message || "Instagram comment fetch error");
    }

    // Fetch from all Bluesky accounts
    const bskyResults = await Promise.allSettled(
      (acctsByProvider.get("bluesky") ?? [])
        .filter((a) => a.platform_user_id)
        .map(async (a) => {
          const label = a.profile_name || a.label || "Bluesky";
          const recent = await fetchRecentBlueskyPosts({ did: a.platform_user_id, maxResults: 20, sinceIso: sevenDaysAgo });
          if (recent.error) errors.push(recent.error);
          if (recent.posts.length === 0) return [] as UnifiedComment[];
          const r = await fetchBlueskyComments(recent.posts, a.id, label);
          if (r.error) errors.push(r.error);
          return r.comments;
        })
    );
    for (const r of bskyResults) {
      if (r.status === "fulfilled") allComments.push(...r.value);
      else errors.push(r.reason?.message || "Bluesky comment fetch error");
    }

    // Sort by most recent first
    allComments.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    // TikTok note: the Content Posting API does not expose comment text — only comment counts
    // are available via video stats. Comment reading requires the Research API (separate approval).
    const hasTikTok = (acctsByProvider.get("tiktok") ?? []).length > 0;

    const debug = {
      accounts: Array.from(acctsByProvider.keys()),
      ytCount: (acctsByProvider.get("youtube") ?? []).length,
      fbCount: (acctsByProvider.get("facebook") ?? []).length,
      igCount: (acctsByProvider.get("instagram") ?? []).length,
      ttCount: (acctsByProvider.get("tiktok") ?? []).length,
    };

    return NextResponse.json({
      ok: true,
      debug,
      errors,
      commentCount: allComments.length,
      comments: allComments,
      tiktokNote: hasTikTok
        ? "TikTok comment text is not available via the Content Posting API. View comment counts in Analytics."
        : undefined,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
