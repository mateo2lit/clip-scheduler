/**
 * Client-safe Bluesky utilities (no server-only imports).
 * Shared between TextPostComposer (client) and blueskyUpload (server).
 */

/**
 * Count grapheme clusters for Bluesky's 300-grapheme limit.
 * Falls back to character count when Intl.Segmenter is unavailable.
 */
export function countBlueskyGraphemes(text: string): number {
  if (typeof Intl !== "undefined" && typeof (Intl as any).Segmenter !== "undefined") {
    const seg = new (Intl as any).Segmenter();
    return [...seg.segment(text)].length;
  }
  return text.length;
}
