export type PublicProfile = {
  display_name: string;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  post_count: number;
};

/**
 * Fetches public profile data for a competitor on a given platform.
 * Returns null if we can't fetch it (missing API key, unsupported platform, user not found).
 *
 * Currently supports:
 * - YouTube (requires GOOGLE_API_KEY or YOUTUBE_API_KEY)
 * - Bluesky (public API, no key needed)
 *
 * Other platforms return null — their public APIs require OAuth or aren't available.
 */
export async function fetchPublicProfile(
  platform: string,
  handle: string
): Promise<PublicProfile | null> {
  try {
    if (platform === "youtube") {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.YOUTUBE_API_KEY;
      if (!apiKey) return null;

      // Try handle lookup first (modern channels have @handles)
      const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;
      let res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&forHandle=${encodeURIComponent(cleanHandle)}&key=${apiKey}`
      );
      let data = await res.json();
      let ch = data.items?.[0];

      // Fallback: try custom URL / legacy username
      if (!ch) {
        res = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&forUsername=${encodeURIComponent(cleanHandle)}&key=${apiKey}`
        );
        data = await res.json();
        ch = data.items?.[0];
      }

      if (!ch) return null;
      return {
        display_name: ch.snippet?.title || handle,
        avatar_url: ch.snippet?.thumbnails?.default?.url || null,
        follower_count: parseInt(ch.statistics?.subscriberCount || "0", 10),
        following_count: 0,
        post_count: parseInt(ch.statistics?.videoCount || "0", 10),
      };
    }

    if (platform === "bluesky") {
      const res = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`
      );
      const data = await res.json();
      if (data.error) return null;
      return {
        display_name: data.displayName || handle,
        avatar_url: data.avatar || null,
        follower_count: data.followersCount || 0,
        following_count: data.followsCount || 0,
        post_count: data.postsCount || 0,
      };
    }

    return null;
  } catch {
    return null;
  }
}
