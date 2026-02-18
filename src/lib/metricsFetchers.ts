import { getYouTubeOAuthClient, getYouTubeApi } from "@/lib/youtube";

export type UnifiedMetric = {
  videoId: string;
  platform: "youtube" | "facebook" | "instagram";
  title: string;
  views: number;
  likes: number;
  comments: number;
  postedAt: string;
};

type PostInfo = {
  id: string;
  title: string | null;
  platform_post_id: string | null;
  platform_media_id?: string | null;
  posted_at: string | null;
};

// ── YouTube ─────────────────────────────────────────────────────────

export async function fetchYouTubeMetrics(
  posts: PostInfo[],
  refreshToken: string
): Promise<{ metrics: UnifiedMetric[]; error?: string }> {
  try {
    const auth = await getYouTubeOAuthClient({ refreshToken });
    const youtube = getYouTubeApi(auth);

    const videoIds = posts
      .map((p) => p.platform_post_id)
      .filter((id): id is string => !!id);

    if (videoIds.length === 0) return { metrics: [] };

    // YouTube allows up to 50 IDs per request
    const metrics: UnifiedMetric[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const res = await youtube.videos.list({
        part: ["statistics", "snippet"],
        id: batch,
      });

      for (const item of res.data.items ?? []) {
        const stats = item.statistics;
        const post = posts.find((p) => p.platform_post_id === item.id);
        metrics.push({
          videoId: item.id ?? "",
          platform: "youtube",
          title: post?.title ?? item.snippet?.title ?? "Untitled",
          views: parseInt(stats?.viewCount ?? "0", 10),
          likes: parseInt(stats?.likeCount ?? "0", 10),
          comments: parseInt(stats?.commentCount ?? "0", 10),
          postedAt: post?.posted_at ?? new Date().toISOString(),
        });
      }
    }

    return { metrics };
  } catch (e: any) {
    return { metrics: [], error: `YouTube: ${e?.message || "Unknown error"}` };
  }
}

// ── Facebook ────────────────────────────────────────────────────────

export async function fetchFacebookMetrics(
  posts: PostInfo[],
  pageAccessToken: string
): Promise<{ metrics: UnifiedMetric[]; error?: string }> {
  try {
    const results = await Promise.allSettled(
      posts.map(async (post) => {
        const postId = post.platform_post_id;
        if (!postId) return null;

        const url = `https://graph.facebook.com/v21.0/${postId}?fields=shares,comments.summary(true),reactions.summary(true)&access_token=${encodeURIComponent(pageAccessToken)}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error?.message || `HTTP ${res.status}`);
        }

        const json = await res.json();
        return {
          videoId: postId,
          platform: "facebook" as const,
          title: post.title ?? "Untitled",
          views: 0, // Facebook doesn't expose video views via this endpoint
          likes: json.reactions?.summary?.total_count ?? 0,
          comments: json.comments?.summary?.total_count ?? 0,
          postedAt: post.posted_at ?? new Date().toISOString(),
        };
      })
    );

    const metrics: UnifiedMetric[] = [];
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) metrics.push(r.value);
      else if (r.status === "rejected") errors.push(r.reason?.message);
    }

    return {
      metrics,
      error: errors.length > 0 ? `Facebook: ${errors[0]}` : undefined,
    };
  } catch (e: any) {
    return { metrics: [], error: `Facebook: ${e?.message || "Unknown error"}` };
  }
}

// ── Instagram ───────────────────────────────────────────────────────

export async function fetchInstagramMetrics(
  posts: PostInfo[],
  accessToken: string
): Promise<{ metrics: UnifiedMetric[]; error?: string }> {
  try {
    const results = await Promise.allSettled(
      posts.map(async (post) => {
        let mediaId = post.platform_media_id;
        if (!mediaId && post.platform_post_id && !post.platform_post_id.startsWith("https://")) {
          mediaId = post.platform_post_id;
        }
        if (!mediaId) return null;

        const url = `https://graph.instagram.com/v21.0/${mediaId}/insights?metric=plays,likes,comments&access_token=${encodeURIComponent(accessToken)}`;
        const res = await fetch(url);

        if (!res.ok) {
          // Fall back to basic fields if insights aren't available
          const basicUrl = `https://graph.instagram.com/v21.0/${mediaId}?fields=like_count,comments_count&access_token=${encodeURIComponent(accessToken)}`;
          const basicRes = await fetch(basicUrl);
          if (!basicRes.ok) return null;

          const basicJson = await basicRes.json();
          return {
            videoId: mediaId,
            platform: "instagram" as const,
            title: post.title ?? "Untitled",
            views: 0,
            likes: basicJson.like_count ?? 0,
            comments: basicJson.comments_count ?? 0,
            postedAt: post.posted_at ?? new Date().toISOString(),
          };
        }

        const json = await res.json();
        const insightsMap: Record<string, number> = {};
        for (const d of json.data ?? []) {
          insightsMap[d.name] = d.values?.[0]?.value ?? 0;
        }

        return {
          videoId: mediaId,
          platform: "instagram" as const,
          title: post.title ?? "Untitled",
          views: insightsMap.plays ?? 0,
          likes: insightsMap.likes ?? 0,
          comments: insightsMap.comments ?? 0,
          postedAt: post.posted_at ?? new Date().toISOString(),
        };
      })
    );

    const metrics: UnifiedMetric[] = [];
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) metrics.push(r.value);
      else if (r.status === "rejected") errors.push(r.reason?.message);
    }

    return {
      metrics,
      error: errors.length > 0 ? `Instagram: ${errors[0]}` : undefined,
    };
  } catch (e: any) {
    return { metrics: [], error: `Instagram: ${e?.message || "Unknown error"}` };
  }
}
