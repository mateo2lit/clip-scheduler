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

export async function fetchRecentTikTokPosts(params: {
  accessToken: string;
  maxResults: number;
  sinceIso?: string;
}): Promise<{ posts: RecentPost[]; error?: string }> {
  try {
    const maxCount = Math.min(Math.max(params.maxResults, 1), 20);
    const res = await fetch(
      `https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,cover_image_url`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ max_count: maxCount }),
      }
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        posts: [],
        error: `TikTok recent posts: ${errBody?.error?.message || `HTTP ${res.status}`}`,
      };
    }

    const json = await res.json();
    const posts: RecentPost[] = [];
    for (const item of json.data?.videos ?? []) {
      const createdAt = item.create_time
        ? new Date(item.create_time * 1000).toISOString()
        : null;
      if (!isAfterSince(createdAt, params.sinceIso)) continue;
      posts.push({
        id: `tt-${item.id}`,
        title: item.title || "TikTok video",
        platform_post_id: item.id ?? null,
        posted_at: createdAt,
        thumbnail_url: item.cover_image_url ?? null,
      });
    }

    return { posts };
  } catch (e: any) {
    return { posts: [], error: `TikTok recent posts: ${e?.message || "Unknown error"}` };
  }
}

export async function fetchRecentBlueskyPosts(params: {
  did: string;
  maxResults: number;
  sinceIso?: string;
}): Promise<{ posts: RecentPost[]; error?: string }> {
  try {
    const limit = Math.min(Math.max(params.maxResults, 1), 100);
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(params.did)}&filter=posts_no_replies&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { posts: [], error: `Bluesky recent posts: HTTP ${res.status}` };
    }

    const json = await res.json();
    const posts: RecentPost[] = [];
    for (const item of json.feed ?? []) {
      const post = item.post;
      if (!post?.uri) continue;
      const createdAt: string | null = post.record?.createdAt ?? post.indexedAt ?? null;
      if (!isAfterSince(createdAt, params.sinceIso)) continue;
      posts.push({
        id: `bsky-${post.uri}`,
        title: (post.record?.text ?? "").slice(0, 120) || "Bluesky post",
        platform_post_id: post.uri,
        posted_at: createdAt,
        thumbnail_url: null,
      });
    }
    return { posts };
  } catch (e: any) {
    return { posts: [], error: `Bluesky recent posts: ${e?.message || "Unknown error"}` };
  }
}


// ── X (Twitter) ──────────────────────────────────────────────────────

export async function fetchRecentXPosts(params: {
  accessToken: string;
  platformUserId: string;
  maxResults: number;
  sinceIso?: string;
}): Promise<{ posts: RecentPost[]; error?: string }> {
  try {
    const maxCount = Math.min(params.maxResults, 100);
    const url = `https://api.twitter.com/2/users/${encodeURIComponent(params.platformUserId)}/tweets?tweet.fields=created_at,attachments&expansions=attachments.media_keys&media.fields=type&max_results=${maxCount}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.errors?.[0]?.message || `HTTP ${res.status}`);
    }

    const json = await res.json();

    // Build a set of tweet IDs that have video media attached
    const mediaMap = new Map<string, string>(); // media_key -> type
    for (const m of json.includes?.media ?? []) {
      mediaMap.set(m.media_key, m.type);
    }

    const posts: RecentPost[] = [];
    for (const tweet of json.data ?? []) {
      // Only include tweets with video attachments
      const mediaKeys: string[] = tweet.attachments?.media_keys ?? [];
      const hasVideo = mediaKeys.some((k) => mediaMap.get(k) === "video");
      if (!hasVideo) continue;

      const createdAt: string | null = tweet.created_at ?? null;
      if (!isAfterSince(createdAt, params.sinceIso)) continue;

      posts.push({
        id: `x-${tweet.id}`,
        title: tweet.text?.slice(0, 120) ?? "X post",
        platform_post_id: tweet.id,
        posted_at: createdAt,
        thumbnail_url: null,
      });
    }

    return { posts };
  } catch (e: any) {
    return { posts: [], error: `X recent posts: ${e?.message || "Unknown error"}` };
  }
}
