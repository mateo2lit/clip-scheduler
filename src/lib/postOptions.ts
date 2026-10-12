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

/**
 * Platforms whose publish API lets us set the platform's own AI-generated label.
 * Facebook, LinkedIn and Bluesky have no such field.
 */
export const AI_LABEL_PLATFORMS = ["tiktok", "youtube", "instagram", "x", "pinterest"] as const;

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

/** Non-negative millisecond offset, or undefined. */
function offsetMs(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
}

/**
 * True when the user picked a cover frame for this post (`cover_offset_ms`). Nearly every
 * post also carries a thumbnail (usually auto-extracted), so a chosen frame must win over
 * it, or the frame setting would never take effect.
 */
export function hasCoverFrame(s: Settings): boolean {
  return offsetMs(s?.cover_offset_ms) !== undefined;
}

// ── TikTok ────────────────────────────────────────────────────────────────────

/** Extra `post_info` fields for TikTok's Direct Post init call. */
export function tiktokPostInfoExtras(s: Settings): {
  is_aigc?: true;
  video_cover_timestamp_ms?: number;
} {
  const out: { is_aigc?: true; video_cover_timestamp_ms?: number } = {};
  if (s?.aigc_disclosure === true) out.is_aigc = true;
  const cover = offsetMs(s?.cover_timestamp_ms);
  if (cover !== undefined) out.video_cover_timestamp_ms = cover;
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

/** "2026-10-11" (a real calendar date) -> "2026-10-11T00:00:00.000Z"; anything else -> undefined. */
function recordingDate(v: unknown): string | undefined {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return undefined;
  return d.toISOString();
}

export type YouTubeLocalization = { language: string; title: string; description: string };

/**
 * Translated titles/descriptions, keyed by language. YouTube only accepts them
 * alongside a default language, and a translation into the default language
 * itself is meaningless, so both cases are dropped.
 */
function youtubeLocalizations(v: unknown, defaultLanguage: string | undefined): Record<string, { title: string; description: string }> {
  const out: Record<string, { title: string; description: string }> = {};
  if (!defaultLanguage || !Array.isArray(v)) return out;
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const language = str(r.language);
    const title = str(r.title).replace(/[<>]/g, "").slice(0, 100);
    const description = str(r.description).slice(0, 5000);
    if (!language || !isLanguageCode(language) || language === defaultLanguage || out[language]) continue;
    if (!title) continue; // YouTube requires a title in every localization
    out[language] = { title, description };
  }
  return out;
}

export function youtubeExtras(s: Settings): {
  snippet: { tags?: string[]; defaultLanguage?: string; defaultAudioLanguage?: string };
  status: { containsSyntheticMedia?: true; license?: "creativeCommon" };
  /**
   * Extra videos.insert parts. Each key is requested as its own `part` and sent in
   * the request body, and only when used, so other uploads are unchanged.
   */
  extraParts: {
    paidProductPlacementDetails?: { hasPaidProductPlacement: true };
    recordingDetails?: { recordingDate: string };
    localizations?: Record<string, { title: string; description: string }>;
  };
} {
  const snippet: { tags?: string[]; defaultLanguage?: string; defaultAudioLanguage?: string } = {};
  const status: { containsSyntheticMedia?: true; license?: "creativeCommon" } = {};
  const extraParts: ReturnType<typeof youtubeExtras>["extraParts"] = {};

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

  // YouTube's "Includes paid promotion" box. Off is YouTube's default, so only "on" is sent.
  if (s?.has_paid_product_placement === true) {
    extraParts.paidProductPlacementDetails = { hasPaidProductPlacement: true };
  }
  const recorded = recordingDate(s?.recording_date);
  if (recorded) extraParts.recordingDetails = { recordingDate: recorded };
  const localizations = youtubeLocalizations(s?.localizations, snippet.defaultLanguage);
  if (Object.keys(localizations).length > 0) extraParts.localizations = localizations;

  return { snippet, status, extraParts };
}

// ── Instagram ─────────────────────────────────────────────────────────────────

const IG_USERNAME = /^[A-Za-z0-9._]{1,30}$/;

/** Valid, de-duplicated, lowercased Instagram usernames, at most `max`. */
function normalizeInstagramUsernames(v: unknown, max: number): string[] {
  const out: string[] = [];
  for (const name of parseList(v)) {
    const lower = name.toLowerCase();
    if (!IG_USERNAME.test(name) || out.includes(lower)) continue;
    out.push(lower);
    if (out.length === max) break;
  }
  return out;
}

/** Instagram allows up to 3 collaborators per post. */
export function normalizeInstagramCollaborators(v: unknown): string[] {
  return normalizeInstagramUsernames(v, 3);
}

/** People tagged in the video. Instagram allows up to 20 tags per post. */
export function normalizeInstagramUserTags(v: unknown): string[] {
  return normalizeInstagramUsernames(v, 20);
}

export type TrialGraduation = "MANUAL" | "SS_PERFORMANCE";

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

  // Tagged people: Reels and Stories both take usernames (Stories' x/y position is optional).
  const userTags = normalizeInstagramUserTags(s?.user_tags);
  if (userTags.length > 0) out.user_tags = JSON.stringify(userTags.map((username) => ({ username })));

  // Collaborators, feed sharing, cover frames, audio names and trials apply to Reels, not Stories.
  if (mediaType === "REELS") {
    const trial = s?.trial_reel === true;
    if (trial) {
      // A trial reel is shown to non-followers first; it graduates to followers manually
      // in the Instagram app or automatically if it performs well.
      const graduation: TrialGraduation = s?.trial_graduation === "SS_PERFORMANCE" ? "SS_PERFORMANCE" : "MANUAL";
      out.trial_params = JSON.stringify({ graduation_strategy: graduation });
    } else {
      // Trial reels can't have collaborators and don't go to followers' feeds, so these are
      // only sent for ordinary reels.
      const collaborators = normalizeInstagramCollaborators(s?.collaborators);
      if (collaborators.length > 0) out.collaborators = JSON.stringify(collaborators);
      // Reels are shared to the feed by default; only opting out is sent.
      if (s?.share_to_feed === false) out.share_to_feed = "false";
    }
    const audioName = str(s?.audio_name);
    if (audioName) out.audio_name = audioName.slice(0, 100);
    const offset = offsetMs(s?.cover_offset_ms);
    if (!hasCover && offset !== undefined) out.thumb_offset = String(offset);
  }
  return out;
}

// ── Facebook ──────────────────────────────────────────────────────────────────

/**
 * Facebook Reels must be 3 to 90 seconds long (Meta's Reels publishing spec).
 * Longer videos are posted as regular Page videos instead.
 */
export const FACEBOOK_REEL_MAX_SECONDS = 90;
export const FACEBOOK_REEL_MIN_SECONDS = 3;

/** True when the post should go out as a Facebook Reel rather than a Page video. */
export function facebookPostsAsReel(s: Settings): boolean {
  return s?.post_as_reel === true;
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────

export type LinkedInVisibility = "PUBLIC" | "CONNECTIONS" | "LOGGED_IN";

/**
 * Post fields for LinkedIn's Posts API. Visibility and isReshareDisabledByAuthor
 * are always sent (LinkedIn requires visibility); their defaults are what every
 * post used before these options existed.
 */
export function linkedinExtras(s: Settings): {
  visibility: LinkedInVisibility;
  isReshareDisabledByAuthor: boolean;
  altText?: string;
} {
  const v = s?.visibility;
  const visibility: LinkedInVisibility = v === "CONNECTIONS" || v === "LOGGED_IN" ? v : "PUBLIC";
  const out: { visibility: LinkedInVisibility; isReshareDisabledByAuthor: boolean; altText?: string } = {
    visibility,
    isReshareDisabledByAuthor: s?.disable_reshare === true,
  };
  const alt = str(s?.alt_text);
  if (alt) out.altText = alt.slice(0, 1000);
  return out;
}

// ── X ─────────────────────────────────────────────────────────────────────────

export type XReplySettings = "following" | "mentionedUsers" | "subscribers" | "verified";

/** Extra fields for X's create-post call. "everyone" is X's default, so it sends nothing. */
export function xExtras(s: Settings): {
  reply_settings?: XReplySettings;
  made_with_ai?: true;
  paid_partnership?: true;
} {
  const out: { reply_settings?: XReplySettings; made_with_ai?: true; paid_partnership?: true } = {};
  const r = s?.reply_settings;
  if (r === "following" || r === "mentionedUsers" || r === "subscribers" || r === "verified") out.reply_settings = r;
  if (s?.made_with_ai === true) out.made_with_ai = true;
  if (s?.paid_partnership === true) out.paid_partnership = true;
  return out;
}

// ── Bluesky ───────────────────────────────────────────────────────────────────

export type BlueskyReplyGate = "following" | "mentioned" | "followers" | "nobody";

/** Bluesky's self-applied content warnings (com.atproto.label.defs#selfLabels). */
export type BlueskyAdultLabel = "sexual" | "nudity" | "porn";

export function blueskyExtras(s: Settings): {
  langs?: string[];
  alt?: string;
  replyGate?: BlueskyReplyGate;
  labels?: string[];
  disableQuotes?: true;
} {
  const out: { langs?: string[]; alt?: string; replyGate?: BlueskyReplyGate; labels?: string[]; disableQuotes?: true } = {};
  const lang = str(s?.language);
  if (lang && isLanguageCode(lang)) out.langs = [lang];
  const alt = str(s?.alt_text);
  if (alt) out.alt = alt.slice(0, 1000);
  const gate = s?.reply_gate;
  if (gate === "following" || gate === "mentioned" || gate === "followers" || gate === "nobody") {
    out.replyGate = gate;
  }
  // One adult-content level (as in Bluesky's own composer) plus, independently, graphic media.
  const labels: string[] = [];
  const adult = s?.adult_label;
  if (adult === "sexual" || adult === "nudity" || adult === "porn") labels.push(adult);
  if (s?.graphic_media === true) labels.push("graphic-media");
  if (labels.length > 0) out.labels = labels;
  // Quote posts are allowed by default; only turning them off is sent.
  if (s?.allow_quotes === false) out.disableQuotes = true;
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

/** A post's `labels` field: self-labels act as content warnings. */
export function blueskySelfLabels(values: string[]): { $type: string; values: Array<{ val: string }> } {
  return { $type: "com.atproto.label.defs#selfLabels", values: values.map((val) => ({ val })) };
}

// ── Pinterest ─────────────────────────────────────────────────────────────────

/** Pinterest's create-Pin limits (API v5): title 100, description 800, alt text 500, link 2048. */
export const PINTEREST_DESCRIPTION_MAX = 800;

export function pinterestExtras(s: Settings): {
  link?: string;
  alt_text?: string;
  board_section_id?: string;
  ai_disclosures?: { values: ["AI_MODIFIED"] };
  /** Cover frame, in whole seconds, used when no custom cover image is sent. */
  cover_image_key_frame_time?: number;
} {
  const out: ReturnType<typeof pinterestExtras> = {};
  const link = str(s?.link);
  if (link && link.length <= 2048 && /^https?:\/\/[^\s]+\.[^\s]+/i.test(link)) out.link = link;
  const alt = str(s?.alt_text);
  if (alt) out.alt_text = alt.slice(0, 500);
  const section = str(s?.board_section_id);
  if (/^\d+$/.test(section)) out.board_section_id = section;
  if (s?.ai_generated === true) out.ai_disclosures = { values: ["AI_MODIFIED"] };
  const offset = offsetMs(s?.cover_offset_ms);
  if (offset !== undefined) out.cover_image_key_frame_time = Math.floor(offset / 1000);
  return out;
}
