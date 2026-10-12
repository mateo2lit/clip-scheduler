/**
 * Upload-page templates ("Templates" menu), stored in the browser's localStorage.
 *
 * A template holds the caption (description, hashtags, per-platform description
 * overrides), the selected platforms, and each selected platform's settings, so
 * loading one restores e.g. YouTube's category, visibility, language and tags.
 *
 * Two deliberate exceptions:
 * - TikTok settings are never stored. TikTok's Content Sharing Guidelines require
 *   the creator to pick privacy, comment/duet/stitch and commercial-content
 *   settings on every post with nothing preselected, and its audit treats a
 *   remembered choice as a default. The TikTok description override is fine:
 *   TikTok allows preset text as long as the user can edit it.
 * - The title is stored only when the user ticks "Include title". Titles are
 *   usually per-video, and templates used to capture whatever was in the title
 *   box, which then overwrote the next video's title.
 *
 * Per-video facts (AI label, paid promotion or partnership, content warnings,
 * cover frames, alt text, tagged people, audio names, recording dates and
 * translations) are not template material and are not stored either.
 *
 * Import-free so it can be unit-tested standalone (scripts/test-post-templates.mjs).
 */

export type TemplateSettings = {
  youtube?: {
    isShort: boolean;
    category: string;
    visibility: "private" | "unlisted" | "public";
    notifySubscribers: boolean;
    allowEmbedding: boolean;
    madeForKids: boolean;
    publicStats: boolean;
    tags: string;
    language: string;
    license: "youtube" | "creativeCommon";
    playlistId: string;
  };
  instagram?: {
    igType: "post" | "reel" | "story";
    firstComment: string;
    collaborators: string;
    shareToFeed: boolean;
    trialReel: boolean;
    trialGraduation: "MANUAL" | "SS_PERFORMANCE";
  };
  linkedin?: { visibility: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN"; disableReshare: boolean };
  x?: { replySettings: "everyone" | "following" | "mentionedUsers" | "subscribers" | "verified" };
  bluesky?: {
    language: string;
    replyGate: "everyone" | "following" | "mentioned" | "followers" | "nobody";
    allowQuotes: boolean;
  };
  pinterest?: { boardId: string; boardSectionId: string; link: string };
};

export type PostTemplate = {
  id: string;
  name: string;
  /** "" unless the user chose to include the title. */
  title: string;
  description: string;
  hashtags: string[];
  platforms: string[];
  /** 2 = saved by the current page. Templates without it predate per-platform settings. */
  version?: 2;
  titleOverrides?: Record<string, string>;
  descriptionOverrides?: Record<string, string>;
  /** Full settings when just built; possibly partial when read back from storage. */
  settings?: LoadedTemplateSettings;
};

/** Platforms whose settings a template must never store. */
export const TEMPLATE_EXCLUDED_SETTINGS: readonly string[] = ["tiktok"];

export type TemplateInput = {
  id: string;
  name: string;
  includeTitle: boolean;
  title: string;
  description: string;
  hashtags: string[];
  platforms: string[];
  titleOverrides: Record<string, string>;
  descriptionOverrides: Record<string, string>;
  /** Current settings for every platform; only the selected, allowed ones are kept. */
  settings: TemplateSettings & Record<string, unknown>;
};

function pickNonEmpty(map: Record<string, string>, platforms: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of platforms) {
    const v = map[p];
    if (typeof v === "string" && v.trim()) out[p] = v;
  }
  return out;
}

export function buildTemplate(input: TemplateInput): PostTemplate {
  const platforms = [...input.platforms];
  const settings: Record<string, unknown> = {};
  for (const p of platforms) {
    if (TEMPLATE_EXCLUDED_SETTINGS.includes(p)) continue;
    const s = (input.settings as Record<string, unknown>)[p];
    if (s && typeof s === "object") settings[p] = { ...(s as object) };
  }
  return {
    id: input.id,
    name: input.name,
    version: 2,
    title: input.includeTitle ? input.title : "",
    description: input.description,
    hashtags: [...input.hashtags],
    platforms,
    titleOverrides: input.includeTitle ? pickNonEmpty(input.titleOverrides, platforms) : {},
    descriptionOverrides: pickNonEmpty(input.descriptionOverrides, platforms),
    settings: settings as TemplateSettings,
  };
}

/**
 * The title to apply when loading, or null to leave the current title alone.
 * Older templates captured the title box whether or not the user meant to save
 * a title, so their title is ignored.
 */
export function templateTitle(t: PostTemplate): string | null {
  if (t.version !== 2) return null;
  return t.title.trim() ? t.title : null;
}

/** A saved template's settings with only valid, correctly typed fields kept. */
export type LoadedTemplateSettings = { [P in keyof TemplateSettings]?: Partial<NonNullable<TemplateSettings[P]>> };

type FieldRule = "string" | "boolean" | readonly string[];

const SETTINGS_SCHEMA: Record<string, Record<string, FieldRule>> = {
  youtube: {
    isShort: "boolean", category: "string", visibility: ["private", "unlisted", "public"],
    notifySubscribers: "boolean", allowEmbedding: "boolean", madeForKids: "boolean", publicStats: "boolean",
    tags: "string", language: "string", license: ["youtube", "creativeCommon"], playlistId: "string",
  },
  instagram: {
    igType: ["post", "reel", "story"], firstComment: "string", collaborators: "string", shareToFeed: "boolean",
    trialReel: "boolean", trialGraduation: ["MANUAL", "SS_PERFORMANCE"],
  },
  linkedin: { visibility: ["PUBLIC", "CONNECTIONS", "LOGGED_IN"], disableReshare: "boolean" },
  x: { replySettings: ["everyone", "following", "mentionedUsers", "subscribers", "verified"] },
  bluesky: { language: "string", replyGate: ["everyone", "following", "mentioned", "followers", "nobody"], allowQuotes: "boolean" },
  pinterest: { boardId: "string", boardSectionId: "string", link: "string" },
};

/** Keeps known platforms and fields of the right type. TikTok is not in the schema, so it never survives. */
export function sanitizeTemplateSettings(raw: unknown): LoadedTemplateSettings {
  const out: Record<string, Record<string, unknown>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [platform, fields] of Object.entries(SETTINGS_SCHEMA)) {
    const src = (raw as Record<string, unknown>)[platform];
    if (!src || typeof src !== "object") continue;
    const kept: Record<string, unknown> = {};
    for (const [field, rule] of Object.entries(fields)) {
      const v = (src as Record<string, unknown>)[field];
      const ok = typeof rule === "string" ? typeof v === rule : typeof v === "string" && rule.includes(v);
      if (ok) kept[field] = v;
    }
    if (Object.keys(kept).length > 0) out[platform] = kept;
  }
  return out as LoadedTemplateSettings;
}

/** Reads templates from localStorage, dropping anything malformed. */
export function parseTemplates(raw: string | null): PostTemplate[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: PostTemplate[] = [];
  for (const t of data) {
    if (!t || typeof t !== "object") continue;
    const r = t as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.name !== "string") continue;
    // Only known platforms and well-typed fields are kept, so a hand-edited template can't put
    // undefined into the form or carry TikTok settings in.
    const settings = r.settings && typeof r.settings === "object" ? sanitizeTemplateSettings(r.settings) : undefined;
    out.push({
      id: r.id,
      name: r.name,
      title: typeof r.title === "string" ? r.title : "",
      description: typeof r.description === "string" ? r.description : "",
      hashtags: Array.isArray(r.hashtags) ? r.hashtags.filter((h): h is string => typeof h === "string") : [],
      platforms: Array.isArray(r.platforms) ? r.platforms.filter((p): p is string => typeof p === "string") : [],
      ...(r.version === 2 ? { version: 2 as const } : {}),
      ...(r.titleOverrides && typeof r.titleOverrides === "object" ? { titleOverrides: r.titleOverrides as Record<string, string> } : {}),
      ...(r.descriptionOverrides && typeof r.descriptionOverrides === "object" ? { descriptionOverrides: r.descriptionOverrides as Record<string, string> } : {}),
      ...(settings ? { settings } : {}),
    });
  }
  return out;
}
