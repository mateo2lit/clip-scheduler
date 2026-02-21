import { getYouTubeApi, getYouTubeOAuthClient } from "@/lib/youtube";

export type RecentPost = {
  id: string;
  title: string | null;
  platform_post_id: string | null;
  platform_media_id?: string | null;
  posted_at: string | null;
  thumbnail_url?: string | null;
};

function isAfterSince(dateIso: string | null | undefined, sinceIso?: string): boolean {
  if (!sinceIso) return true;
  if (!dateIso) return false;
  return new Date(dateIso).getTime() >= new Date(sinceIso).getTime();
}

export async function fetchRecentYouTubePosts(params: {
  refreshToken: string;
  maxResults: number;
  sinceIso?: string;
}): Promise<{ posts: RecentPost[]; error?: string }> {
  try {
    const auth = await getYouTubeOAuthClient({ refreshToken: params.refreshToken });
    const youtube = getYouTubeApi(auth);

    const res = await youtube.search.list({
      part: ["snippet"],
      forMine: true,
      type: ["video"],
      order: "date",
      maxResults: Math.min(Math.max(params.maxResults, 1), 50),
    });

    const posts: RecentPost[] = [];
    for (const item of res.data.items ?? []) {
      const videoId = item.id?.videoId ?? null;
      const publishedAt = item.snippet?.publishedAt ?? null;
      if (!videoId) continue;
      if (!isAfterSince(publishedAt, params.sinceIso)) continue;

      posts.push({
        id: `yt-${videoId}`,
        title: item.snippet?.title ?? "Untitled",
        platform_post_id: videoId,
        posted_at: publishedAt,
        thumbnail_url:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.default?.url ||
          null,
      });
    }

    return { posts };
  } catch (e: any) {
    return { posts: [], error: `YouTube recent posts: ${e?.message || "Unknown error"}` };
  }
}

export async function fetchRecentFacebookPosts(params: {
  pageId: string;
  pageAccessToken: string;
  maxResults: number;
  sinceIso?: string;
}): Promise<{ posts: RecentPost[]; error?: string }> {
  try {
    const url = `https://graph.facebook.com/v21.0/${params.pageId}/posts?fields=id,message,created_time,full_picture&limit=${Math.min(
      Math.max(params.maxResults, 1),
      50
    )}&access_token=${encodeURIComponent(params.pageAccessToken)}`;

    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        posts: [],
        error: `Facebook recent posts: ${errBody?.error?.message || `HTTP ${res.status}`}`,
      };
    }

    const json = await res.json();
    const posts: RecentPost[] = [];
    for (const item of json.data ?? []) {
      const createdAt = item.created_time ?? null;
      if (!isAfterSince(createdAt, params.sinceIso)) continue;
      posts.push({
        id: `fb-${item.id}`,
        title: item.message?.slice(0, 120) ?? "Facebook post",
        platform_post_id: item.id ?? null,
        posted_at: createdAt,
        thumbnail_url: item.full_picture ?? null,
      });
    }

    return { posts };
  } catch (e: any) {
    return { posts: [], error: `Facebook recent posts: ${e?.message || "Unknown error"}` };
  }
}

export async function fetchRecentInstagramPosts(params: {
  igUserId: string;
  accessToken: string;
  maxResults: number;
  sinceIso?: string;
}): Promise<{ posts: RecentPost[]; error?: string }> {
  try {
    const url = `https://graph.instagram.com/v21.0/${params.igUserId}/media?fields=id,caption,timestamp,permalink,media_type,media_url,thumbnail_url&limit=${Math.min(
      Math.max(params.maxResults, 1),
      50
    )}&access_token=${encodeURIComponent(params.accessToken)}`;

    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        posts: [],
        error: `Instagram recent posts: ${errBody?.error?.message || `HTTP ${res.status}`}`,
      };
    }

    const json = await res.json();
    const posts: RecentPost[] = [];
    for (const item of json.data ?? []) {
      const createdAt = item.timestamp ?? null;
      if (!isAfterSince(createdAt, params.sinceIso)) continue;
      posts.push({
        id: `ig-${item.id}`,
        title: item.caption?.slice(0, 120) ?? "Instagram post",
        platform_post_id: item.permalink || item.id || null,
        platform_media_id: item.id ?? null,
        posted_at: createdAt,
        thumbnail_url: item.thumbnail_url || item.media_url || null,
      });
    }

    return { posts };
  } catch (e: any) {
    return { posts: [], error: `Instagram recent posts: ${e?.message || "Unknown error"}` };
  }
}
