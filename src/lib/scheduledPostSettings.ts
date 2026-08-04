/**
 * Maps a post's provider to its per-platform settings column on scheduled_posts.
 *
 * Import-free so it can be unit-tested standalone
 * (scripts/test-scheduled-post-settings.mjs).
 */

/**
 * Provider -> settings column. This is an explicit allowlist rather than a
 * `${provider}_settings` template on purpose: scheduled_posts has no
 * snapchat_settings column, and deriving the name would turn a dropped setting
 * into a failed insert.
 *
 * Every entry here must be a column that exists AND that the worker reads in
 * src/app/api/worker/run-scheduled/route.ts. Adding a platform means adding one
 * line here — that is the whole point, since the previous hand-rolled per-platform
 * `if` blocks drifted out of sync with the worker and silently dropped Pinterest,
 * Bluesky and X settings.
 */
export const PLATFORM_SETTINGS_COLUMNS: Record<string, string> = {
  tiktok: "tiktok_settings",
  facebook: "facebook_settings",
  instagram: "instagram_settings",
  youtube: "youtube_settings",
  linkedin: "linkedin_settings",
  bluesky: "bluesky_settings",
  x: "x_settings",
  pinterest: "pinterest_settings",
};

/**
 * Picks the settings blob to persist for this post, or null when there is
 * nothing to store.
 *
 * Only the column matching the post's own provider is ever written, so a body
 * carrying settings for several platforms (the uploads page builds one body per
 * selected platform) cannot cross-contaminate rows.
 */
export function resolvePlatformSettings(
  provider: string | null | undefined,
  body: Record<string, any>
): { column: string; value: unknown } | null {
  const normalized = String(provider ?? "").trim().toLowerCase();
  const column = PLATFORM_SETTINGS_COLUMNS[normalized];
  if (!column) return null;

  const value = body?.[column];
  if (value === undefined || value === null) return null;

  return { column, value };
}
