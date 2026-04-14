/**
 * Resolves a scheduled_posts.thumbnail_path (relative Supabase Storage path in "clips" bucket)
 * to a full public URL that can be used directly in an <img src>.
 * Returns null if path is empty.
 */
export function resolveThumbnailUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  // Already a full URL (some platforms return CDN URLs directly)
  if (/^https?:\/\//i.test(path)) return path;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/clips/${path}`;
}

/**
 * Ensures a user-entered URL is safe to use as an absolute navigation target.
 * If the URL starts with "http://" or "https://", returns as-is.
 * If it starts with "//", prepends "https:".
 * Otherwise, prepends "https://".
 * Empty/invalid input returns "#" so clicks don't navigate to relative paths.
 */
export function normalizeExternalUrl(url: string | null | undefined): string {
  if (!url) return "#";
  const trimmed = url.trim();
  if (!trimmed) return "#";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return "https:" + trimmed;
  if (trimmed.startsWith("/")) return "#"; // prevent relative navigation
  if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return trimmed;
  return "https://" + trimmed;
}

/**
 * Builds a public permalink to a posted piece of content on its source platform.
 * Falls back to the platform's home page if we don't have enough data.
 */
export function resolvePostPermalink(
  provider: string,
  platformPostId: string | null | undefined,
  account: { profile_name?: string | null; platform_user_id?: string | null } | null | undefined
): string | null {
  if (!platformPostId) return null;
  const handle = account?.profile_name || account?.platform_user_id || "";

  switch (provider) {
    case "youtube":
      // platform_post_id is the video ID
      return `https://www.youtube.com/watch?v=${platformPostId}`;
    case "tiktok":
      if (handle) return `https://www.tiktok.com/@${handle}/video/${platformPostId}`;
      return `https://www.tiktok.com/video/${platformPostId}`;
    case "instagram":
      // Instagram returns a media ID; we can't build a guaranteed URL without a shortcode.
      // The platform_post_id for IG media is usually "{account}_{media}" — no public URL pattern works reliably.
      // Best effort: link to the profile.
      if (handle) return `https://www.instagram.com/${handle}/`;
      return null;
    case "facebook":
      return `https://www.facebook.com/${platformPostId}`;
    case "linkedin":
      return `https://www.linkedin.com/feed/update/${platformPostId}/`;
    case "threads":
      if (handle) return `https://www.threads.net/@${handle}/post/${platformPostId}`;
      return null;
    case "bluesky":
      // platform_post_id is the AT URI or rkey; best effort
      if (handle && platformPostId.includes("/")) {
        const parts = platformPostId.split("/");
        const rkey = parts[parts.length - 1];
        return `https://bsky.app/profile/${handle}/post/${rkey}`;
      }
      return null;
    case "x":
      if (handle) return `https://x.com/${handle}/status/${platformPostId}`;
      return `https://x.com/i/status/${platformPostId}`;
    default:
      return null;
  }
}
