// Import-free so tests can load it directly.
/**
 * Public link to a published post. YouTube plays any video in the regular player at
 * /watch, so Shorts must link to /shorts/ to open in the Shorts player.
 */
export function getPostUrl(
  provider: string | null,
  platformPostId: string | null,
  opts: { youtubeIsShort?: boolean } = {}
): string | null {
  if (!platformPostId) return null;
  if (provider === "youtube") {
    return opts.youtubeIsShort
      ? `https://www.youtube.com/shorts/${platformPostId}`
      : `https://www.youtube.com/watch?v=${platformPostId}`;
  }
  if (provider === "facebook") return `https://www.facebook.com/${platformPostId}`;
  if (provider === "linkedin") return `https://www.linkedin.com/feed/update/${platformPostId}`;
  if (provider === "instagram" && platformPostId.startsWith("https://")) return platformPostId;
  if (provider === "pinterest") return `https://www.pinterest.com/pin/${platformPostId}/`;
  return null;
}
