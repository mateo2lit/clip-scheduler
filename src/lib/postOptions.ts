/**
 * Turns the optional per-platform post options saved on a scheduled post's
 * `*_settings` JSON into the extra fields each platform's publish API expects.
 *
 * Every option is opt-in: an unset (or invalid) option adds nothing, so a post
 * that doesn't use these options sends exactly the same request as before they
 * existed. Keep it that way — posts scheduled before a deploy are published by
 * the new worker.
 *
 * Import-free so it can be unit-tested standalone
 * (scripts/test-post-options.mjs).
 */

/** Platforms whose publish API lets us set the platform's own AI-generated label. */
export const AI_LABEL_PLATFORMS = ["tiktok", "youtube", "instagram"] as const;

type Settings = Record<string, unknown> | null | undefined;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isLanguageCode(v: string): boolean {
  // BCP-47-ish: "en", "es", "pt-BR", "zh-Hant"
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(v);
}

/** Splits "a, @b c" into ["a", "b", "c"]; accepts an array too. */
export function parseList(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,]+/) : [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim().replace(/^[@#]+/, "") : ""))
    .filter(Boolean);
}

// ── TikTok ────────────────────────────────────────────────────────────────────

/** Extra `post_info` fields for TikTok's Direct Post init call. */
export function tiktokPostInfoExtras(s: Settings): {
  is_aigc?: true;
  video_cover_timestamp_ms?: number;
} {
  const out: { is_aigc?: true; video_cover_timestamp_ms?: number } = {};
  if (s?.aigc_disclosure === true) out.is_aigc = true;
  const cover = s?.cover_timestamp_ms;
  if (typeof cover === "number" && Number.isFinite(cover) && cover >= 0) {
    out.video_cover_timestamp_ms = Math.round(cover);
  }
  return out;
}

// ── YouTube ───────────────────────────────────────────────────────────────────

/**
 * YouTube caps tags at 500 characters in total, where a tag containing a space
 * counts its surrounding quotes and tags are joined by commas. Tags past the cap
 * are dropped rather than failing the upload.
 */
export function normalizeYouTubeTags(v: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let used = 0;
  for (const tag of parseListKeepingSpaces(v)) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    const cost = tag.length + (tag.includes(" ") ? 2 : 0) + (out.length > 0 ? 1 : 0);
    if (used + cost > 500) break;
    seen.add(key);
    out.push(tag);
    used += cost;
  }
  return out;
}

// YouTube tags may contain spaces, so they are split on commas only.
function parseListKeepingSpaces(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim().replace(/^#+/, "").replace(/[<>]/g, "") : ""))
    .filter(Boolean);
}

export function youtubeExtras(s: Settings): {
  snippet: { tags?: string[]; defaultLanguage?: string; defaultAudioLanguage?: string };
  status: { containsSyntheticMedia?: true; license?: "creativeCommon" };
} {
  const snippet: { tags?: string[]; defaultLanguage?: string; defaultAudioLanguage?: string } = {};
  const status: { containsSyntheticMedia?: true; license?: "creativeCommon" } = {};

  const tags = normalizeYouTubeTags(s?.tags);
  if (tags.length > 0) snippet.tags = tags;

  const lang = str(s?.default_language);
  if (lang && isLanguageCode(lang)) {
    snippet.defaultLanguage = lang;
    snippet.defaultAudioLanguage = lang;
  }

  if (s?.contains_synthetic_media === true) status.containsSyntheticMedia = true;
  // "youtube" (Standard YouTube License) is the default, so only the change is sent.
  if (s?.license === "creativeCommon") status.license = "creativeCommon";

  return { snippet, status };
}

// ── Instagram ─────────────────────────────────────────────────────────────────

const IG_USERNAME = /^[A-Za-z0-9._]{1,30}$/;

/** Instagram allows up to 3 collaborators per post. */
export function normalizeInstagramCollaborators(v: unknown): string[] {
  const out: string[] = [];
  for (const name of parseList(v)) {
    const lower = name.toLowerCase();
    if (!IG_USERNAME.test(name) || out.includes(lower)) continue;
    out.push(lower);
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Extra form fields for the Instagram media-container call. `hasCover` is true
 * when a custom cover image is being sent as cover_url, which wins over a
 * cover frame offset.
 */
export function instagramContainerExtras(
  s: Settings,
  mediaType: "REELS" | "STORIES",
  hasCover: boolean
): Record<string, string> {
  const out: Record<string, string> = {};
  if (s?.ai_generated === true) out.is_ai_generated = "true";

  // Collaborators, feed sharing and cover frames apply to Reels, not Stories.
  if (mediaType === "REELS") {
    const collaborators = normalizeInstagramCollaborators(s?.collaborators);
    if (collaborators.length > 0) out.collaborators = JSON.stringify(collaborators);
    // Reels are shared to the feed by default; only opting out is sent.
    if (s?.share_to_feed === false) out.share_to_feed = "false";
    const offset = s?.cover_offset_ms;
    if (!hasCover && typeof offset === "number" && Number.isFinite(offset) && offset >= 0) {
      out.thumb_offset = String(Math.round(offset));
    }
  }
  return out;
}

// ── Bluesky ───────────────────────────────────────────────────────────────────

export type BlueskyReplyGate = "following" | "mentioned" | "followers" | "nobody";

export function blueskyExtras(s: Settings): {
  langs?: string[];
  alt?: string;
  replyGate?: BlueskyReplyGate;
} {
  const out: { langs?: string[]; alt?: string; replyGate?: BlueskyReplyGate } = {};
  const lang = str(s?.language);
  if (lang && isLanguageCode(lang)) out.langs = [lang];
  const alt = str(s?.alt_text);
  if (alt) out.alt = alt.slice(0, 1000);
  const gate = s?.reply_gate;
  if (gate === "following" || gate === "mentioned" || gate === "followers" || gate === "nobody") {
    out.replyGate = gate;
  }
  return out;
}

/** The `allow` list of an app.bsky.feed.threadgate record. An empty list means nobody can reply. */
export function blueskyThreadgateAllow(gate: BlueskyReplyGate): Array<{ $type: string }> {
  switch (gate) {
    case "following":
      return [{ $type: "app.bsky.feed.threadgate#followingRule" }];
    case "mentioned":
      return [{ $type: "app.bsky.feed.threadgate#mentionRule" }];
    case "followers":
      return [{ $type: "app.bsky.feed.threadgate#followerRule" }];
    case "nobody":
      return [];
  }
}

// ── Pinterest ─────────────────────────────────────────────────────────────────

export function pinterestExtras(s: Settings): { link?: string; alt_text?: string } {
  const out: { link?: string; alt_text?: string } = {};
  const link = str(s?.link);
  if (link && link.length <= 2048 && /^https?:\/\/[^\s]+\.[^\s]+/i.test(link)) out.link = link;
  const alt = str(s?.alt_text);
  if (alt) out.alt_text = alt.slice(0, 500);
  return out;
}
