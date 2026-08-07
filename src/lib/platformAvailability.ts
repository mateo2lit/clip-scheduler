/**
 * Platforms with a temporary notice — either connectable but not publishing yet
 * (usually because the platform's own app review is still pending), or, when
 * `blocksConnect` is set, unable to even connect right now.
 *
 * This is the single source of truth for every "coming soon" / degraded-service
 * notice in the app and on the marketing pages. To turn a platform back on,
 * delete its entry here — nothing else needs editing, and no notice can be
 * left behind.
 *
 * Import-free so it can be unit-tested standalone
 * (scripts/test-platform-availability.mjs).
 */

export type ComingSoonNotice = {
  /** Short pill text, e.g. shown next to the platform name. */
  badge: string;
  /** One-line explanation for compact spots. */
  short: string;
  /** Fuller explanation for settings and the platform detail page. */
  long: string;
  /** When true, the Connect button itself is intercepted instead of starting OAuth. */
  blocksConnect?: boolean;
};

export const PLATFORM_COMING_SOON: Record<string, ComingSoonNotice> = {
  pinterest: {
    badge: "Coming soon",
    short: "Pinterest publishing isn't live yet — scheduled pins won't post.",
    long:
      "Pinterest is still reviewing our app for publishing access. You can connect your " +
      "account and set up pins now, but anything you schedule will fail until Pinterest " +
      "approves us. Everything else — connections, boards, scheduling — is ready to go.",
  },
  instagram: {
    badge: "Temporary issue",
    short: "Instagram connections are affected by a Meta platform issue right now.",
    long:
      "Meta is having an issue on their end that's blocking new Instagram connections. " +
      "Email contact@shakyventure.com with your Instagram handle and we'll get you " +
      "connected manually, usually within minutes, while this gets sorted out on Meta's side.",
    blocksConnect: true,
  },
};

/** The notice for a provider, or null when the platform is fully live. */
export function comingSoonNotice(provider: string | null | undefined): ComingSoonNotice | null {
  const key = String(provider ?? "").trim().toLowerCase();
  return PLATFORM_COMING_SOON[key] ?? null;
}

export function isComingSoon(provider: string | null | undefined): boolean {
  return comingSoonNotice(provider) !== null;
}

/** Providers with a pending notice, lowercase. */
export function comingSoonProviders(): string[] {
  return Object.keys(PLATFORM_COMING_SOON);
}
