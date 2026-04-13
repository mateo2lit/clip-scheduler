import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import {
  fetchYouTubeComments,
  fetchFacebookComments,
  fetchInstagramComments,
  fetchBlueskyComments,
  fetchXComments,
  fetchThreadsComments,
  type UnifiedComment,
} from "@/lib/commentFetchers";
import {
  fetchRecentYouTubePosts,
  fetchRecentFacebookPosts,
  fetchRecentInstagramPosts,
  fetchRecentBlueskyPosts,
  fetchRecentXPosts,
  fetchRecentThreadsPosts,
} from "@/lib/recentPlatformPosts";
import { getXAccessToken } from "@/lib/x";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;

    // Load all platform accounts for this team
    const { data: accounts } = await supabaseAdmin
      .from("platform_accounts")
      .select("id, provider, refresh_token, access_token, page_id, page_access_token, ig_user_id, platform_user_id, profile_name, label, expiry")
      .eq("team_id", teamId)
      .in("provider", ["youtube", "facebook", "instagram", "bluesky", "x", "threads"]);

    const acctsByProvider = new Map<string, any[]>();
    for (const a of accounts ?? []) {
      if (!acctsByProvider.has(a.provider)) acctsByProvider.set(a.provider, []);
      acctsByProvider.get(a.provider)!.push(a);
    }

    // Parse date range from query params — all platforms use the same range
    const url = new URL(req.url);
    const rangeParam = url.searchParams.get("range") || "7d";
    const rangeDays: Record<string, number> = { "3d": 3, "7d": 7, "14d": 14, "30d": 30 };
    const days = rangeDays[rangeParam] || 7;
    const now = new Date();
    const sinceIso = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    const errors: string[] = [];
    const allComments: UnifiedComment[] = [];

    // ── YouTube ──────────────────────────────────────────────────────
    const ytResults = await Promise.allSettled(
      (acctsByProvider.get("youtube") ?? [])
        .filter((a) => a.refresh_token)
        .map(async (a) => {
          const label = a.profile_name || a.label || "YouTube";
          const recent = await fetchRecentYouTubePosts({ refreshToken: a.refresh_token, maxResults: 20, sinceIso });
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

    // ── Facebook ─────────────────────────────────────────────────────
    const fbResults = await Promise.allSettled(
      (acctsByProvider.get("facebook") ?? [])
        .filter((a) => a.page_id && a.page_access_token)
        .map(async (a) => {
          const label = a.profile_name || a.label || "Facebook";
          const recent = await fetchRecentFacebookPosts({ pageId: a.page_id, pageAccessToken: a.page_access_token, maxResults: 20, sinceIso });
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

    // ── Instagram ────────────────────────────────────────────────────
    const igResults = await Promise.allSettled(
      (acctsByProvider.get("instagram") ?? [])
        .filter((a) => a.ig_user_id && a.access_token)
        .map(async (a) => {
          const label = a.profile_name || a.label || "Instagram";
          const recent = await fetchRecentInstagramPosts({ igUserId: a.ig_user_id, accessToken: a.access_token, maxResults: 20, sinceIso });
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

    // ── Bluesky ──────────────────────────────────────────────────────
    const bskyResults = await Promise.allSettled(
      (acctsByProvider.get("bluesky") ?? [])
        .filter((a) => a.platform_user_id)
        .map(async (a) => {
          const label = a.profile_name || a.label || "Bluesky";
          const recent = await fetchRecentBlueskyPosts({ did: a.platform_user_id, maxResults: 20, sinceIso });
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

    // ── X (Twitter) ──────────────────────────────────────────────────
    const xResults = await Promise.allSettled(
      (acctsByProvider.get("x") ?? [])
        .filter((a) => a.refresh_token && a.platform_user_id)
        .map(async (a) => {
          const label = a.profile_name || a.label || "X";

          // Get a fresh access token
          const tokens = await getXAccessToken({
            refreshToken: a.refresh_token,
            accessToken: a.access_token,
            expiresAt: a.expiry,
          });

          // Persist refreshed tokens
          await supabaseAdmin
            .from("platform_accounts")
            .update({
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken,
              expiry: tokens.expiresAt.toISOString(),
            })
            .eq("id", a.id);

          const recent = await fetchRecentXPosts({ accessToken: tokens.accessToken, platformUserId: a.platform_user_id, maxResults: 20, sinceIso });
          if (recent.error) errors.push(recent.error);
          if (recent.posts.length === 0) return [] as UnifiedComment[];
          const r = await fetchXComments(recent.posts, tokens.accessToken, a.id, label);
          if (r.error) errors.push(r.error);
          return r.comments;
        })
    );
    for (const r of xResults) {
      if (r.status === "fulfilled") allComments.push(...r.value);
      else errors.push(r.reason?.message || "X comment fetch error");
    }

    // ── Threads ──────────────────────────────────────────────────────
    const threadsResults = await Promise.allSettled(
      (acctsByProvider.get("threads") ?? [])
        .filter((a) => a.platform_user_id && a.access_token)
        .map(async (a) => {
          const label = a.profile_name || a.label || "Threads";
          const recent = await fetchRecentThreadsPosts({ threadsUserId: a.platform_user_id, accessToken: a.access_token, maxResults: 20, sinceIso });
          if (recent.error) errors.push(recent.error);
          if (recent.posts.length === 0) return [] as UnifiedComment[];
          const r = await fetchThreadsComments(recent.posts, a.access_token, a.id, label);
          if (r.error) errors.push(r.error);
          return r.comments;
        })
    );
    for (const r of threadsResults) {
      if (r.status === "fulfilled") allComments.push(...r.value);
      else errors.push(r.reason?.message || "Threads comment fetch error");
    }

    // Sort by most recent first
    allComments.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    return NextResponse.json({
      ok: true,
      errors,
      commentCount: allComments.length,
      comments: allComments,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
