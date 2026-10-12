/**
 * Upload-page items saved in the browser (post templates, YouTube presets), kept per
 * account.
 *
 * They used to share one localStorage slot per browser, so every account signed in on
 * that browser saw every other account's templates. Each account now has its own slot
 * (`<key>:<userId>`). Items saved before the split can't be traced to an account, so
 * the page offers them once — "Add to this account" or "Not mine" — instead of guessing.
 *
 * Import-free so it can be unit-tested standalone (scripts/test-account-storage.mjs).
 */

/** The old shared, per-browser slots. */
export const LEGACY_STORAGE_KEYS = {
  templates: "clipdash_post_templates",
  ytPresets: "clip-scheduler-yt-presets",
  subtitlePresets: "ai-clips-custom-presets",
} as const;

/** This account's slot for one kind of item. */
export function accountStorageKey(base: string, userId: string): string {
  return `${base}:${userId}`;
}

/**
 * Set when this account answered "Not mine" to the shared items saved before the split.
 * `scope` keeps the upload page's offer separate from the AI Clips subtitle presets'.
 */
export function legacyDismissedKey(userId: string, scope: "uploads" | "subtitles" = "uploads"): string {
  return scope === "uploads"
    ? `clipdash_legacy_saved_dismissed:${userId}`
    : `clipdash_legacy_${scope}_dismissed:${userId}`;
}

/** `own` plus whatever in `incoming` it doesn't already have (by key), own items first. */
export function mergeByKey<T>(own: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set(own.map(keyOf));
  const out = [...own];
  for (const item of incoming) {
    const k = keyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** Minimal Storage surface, so tests can pass a fake. */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** localStorage can throw (private mode, blocked storage); treat that as empty. */
export function safeGet(store: KeyValueStore | null | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSet(store: KeyValueStore | null | undefined, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    // Saving is best-effort; the page keeps working with what's in memory.
  }
}

export function safeRemove(store: KeyValueStore | null | undefined, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // ignore
  }
}
