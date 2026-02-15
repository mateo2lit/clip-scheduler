import { getYouTubeOAuthClient, getYouTubeApi } from "@/lib/youtube";

export type UnifiedComment = {
  id: string;
  platform: "youtube" | "facebook" | "instagram";
  postTitle: string;
  postId: string;
  authorName: string;
  authorImageUrl: string | null;
  text: string;
  publishedAt: string;
  likeCount: number;
};

type PostInfo = {
  id: string;
  title: string | null;
  platform_post_id: string | null;
  platform_media_id?: string | null;
};

// ── YouTube ─────────────────────────────────────────────────────────

export async function fetchYouTubeComments(
  posts: PostInfo[],
  refreshToken: string
): Promise<{ comments: UnifiedComment[]; error?: string }> {
  try {
    const auth = await getYouTubeOAuthClient({ refreshToken });
    const youtube = getYouTubeApi(auth);

    const results = await Promise.allSettled(
      posts.map(async (post) => {
        const videoId = post.platform_post_id;
        if (!videoId) return [];

        const res = await youtube.commentThreads.list({
          part: ["snippet"],
          videoId,
          maxResults: 20,
        });

        const items = res.data.items ?? [];
        return items.map((item): UnifiedComment => {
          const snippet = item.snippet!.topLevelComment!.snippet!;
          return {
            id: item.id ?? `yt-${videoId}-${Math.random()}`,
            platform: "youtube",
            postTitle: post.title ?? "Untitled",
            postId: videoId,
            authorName: snippet.authorDisplayName ?? "Unknown",
            authorImageUrl: snippet.authorProfileImageUrl ?? null,
            text: snippet.textDisplay ?? "",
            publishedAt: snippet.publishedAt ?? new Date().toISOString(),
            likeCount: snippet.likeCount ?? 0,
          };
        });
      })
    );

    const comments: UnifiedComment[] = [];
    const perVideoErrors: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") comments.push(...r.value);
      else perVideoErrors.push(r.reason?.message || "Unknown video error");
    }
    return {
      comments,
      error: perVideoErrors.length > 0 ? `YouTube: ${perVideoErrors[0]}` : undefined,
    };
  } catch (e: any) {
    return { comments: [], error: `YouTube: ${e?.message || "Unknown error"}` };
  }
}

// ── Facebook ────────────────────────────────────────────────────────

export async function fetchFacebookComments(
  posts: PostInfo[],
  pageAccessToken: string
): Promise<{ comments: UnifiedComment[]; error?: string }> {
  try {
    const results = await Promise.allSettled(
      posts.map(async (post) => {
        const postId = post.platform_post_id;
        if (!postId) return [];

        const url = `https://graph.facebook.com/v21.0/${postId}/comments?fields=from{id,name},message,created_time,like_count&access_token=${encodeURIComponent(pageAccessToken)}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error?.message || `HTTP ${res.status}`);
        }

        const json = await res.json();
        const items: any[] = json.data ?? [];

        return items.map((item): UnifiedComment => ({
          id: item.id ?? `fb-${postId}-${Math.random()}`,
          platform: "facebook",
          postTitle: post.title ?? "Untitled",
          postId: postId,
          authorName: item.from?.name ?? "Unknown",
          authorImageUrl: null,
          text: item.message ?? "",
          publishedAt: item.created_time ?? new Date().toISOString(),
          likeCount: item.like_count ?? 0,
        }));
      })
    );

    const comments: UnifiedComment[] = [];
    const perPostErrors: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") comments.push(...r.value);
      else perPostErrors.push(r.reason?.message || "Unknown post error");
    }
    return {
      comments,
      error: perPostErrors.length > 0 ? `Facebook: ${perPostErrors[0]}` : undefined,
    };
  } catch (e: any) {
    return { comments: [], error: `Facebook: ${e?.message || "Unknown error"}` };
  }
}

// ── Instagram ───────────────────────────────────────────────────────

export async function fetchInstagramComments(
  posts: PostInfo[],
  accessToken: string,
  igUserId: string
): Promise<{ comments: UnifiedComment[]; error?: string }> {
  try {
    // Build permalink → media ID lookup for posts missing platform_media_id
    let permalinkToMediaId: Map<string, string> | null = null;
    const needsLookup = posts.some((p) => !p.platform_media_id && p.platform_post_id?.startsWith("https://"));

    if (needsLookup) {
      try {
        const mediaRes = await fetch(
          `https://graph.instagram.com/v21.0/${igUserId}/media?fields=id,permalink&limit=50&access_token=${encodeURIComponent(accessToken)}`
        );
        if (mediaRes.ok) {
          const mediaJson = await mediaRes.json();
          permalinkToMediaId = new Map();
          for (const m of mediaJson.data ?? []) {
            if (m.permalink) permalinkToMediaId.set(m.permalink, m.id);
          }
        }
      } catch {
        // Fall through — posts without media IDs just won't get comments
      }
    }

    const results = await Promise.allSettled(
      posts.map(async (post) => {
        let mediaId = post.platform_media_id;

        if (!mediaId && post.platform_post_id?.startsWith("https://") && permalinkToMediaId) {
          mediaId = permalinkToMediaId.get(post.platform_post_id) ?? null;
        }

        if (!mediaId) return [];

        const url = `https://graph.instagram.com/v21.0/${mediaId}/comments?fields=id,text,username,timestamp,like_count&access_token=${encodeURIComponent(accessToken)}`;
        const res = await fetch(url);

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const code = errBody?.error?.code;
          // Permission error — user needs to reconnect
          if (code === 190 || code === 10 || res.status === 403) {
            throw new Error("reconnect_required");
          }
          return [];
        }

        const json = await res.json();
        const items: any[] = json.data ?? [];

        return items.map((item): UnifiedComment => ({
          id: item.id ?? `ig-${mediaId}-${Math.random()}`,
          platform: "instagram",
          postTitle: post.title ?? "Untitled",
          postId: post.platform_post_id ?? mediaId!,
          authorName: item.username ?? "Unknown",
          authorImageUrl: null,
          text: item.text ?? "",
          publishedAt: item.timestamp ?? new Date().toISOString(),
          likeCount: item.like_count ?? 0,
        }));
      })
    );

    let reconnectNeeded = false;
    const comments: UnifiedComment[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        comments.push(...r.value);
      } else if (r.reason?.message === "reconnect_required") {
        reconnectNeeded = true;
      }
    }

    return {
      comments,
      error: reconnectNeeded ? "Reconnect Instagram to see comments" : undefined,
    };
  } catch (e: any) {
    if (e?.message === "reconnect_required") {
      return { comments: [], error: "Reconnect Instagram to see comments" };
    }
    return { comments: [], error: `Instagram: ${e?.message || "Unknown error"}` };
  }
}
