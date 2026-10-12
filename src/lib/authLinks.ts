/**
 * Helpers for the links in Supabase's auth emails.
 *
 * Import-free so it can be unit-tested standalone (scripts/test-auth-links.mjs).
 */

export type EmailOtpType = "recovery" | "signup" | "invite" | "magiclink" | "email_change" | "email";

const OTP_TYPES: readonly EmailOtpType[] = ["recovery", "signup", "invite", "magiclink", "email_change", "email"];

/** token_hash + type from an /auth/confirm link, or null when either is missing or unknown. */
export function readConfirmParams(
  q: URLSearchParams
): { tokenHash: string; type: EmailOtpType; next: string | null } | null {
  const tokenHash = q.get("token_hash")?.trim();
  const type = q.get("type") as EmailOtpType | null;
  if (!tokenHash || !type || !OTP_TYPES.includes(type)) return null;
  const next = q.get("next");
  // Only same-site paths, so a crafted link can't bounce people to another site.
  return { tokenHash, type, next: next && next.startsWith("/") && !next.startsWith("//") ? next : null };
}

/** Where to go after a confirmed (non-recovery) link. */
export function confirmDestination(params: { next: string | null }, isNewUser: boolean): string {
  if (params.next) return params.next;
  return isNewUser ? "/onboarding" : "/dashboard";
}

/**
 * Supabase sends people to the Site URL root (`/?code=...`) when a link's redirect
 * isn't on its allow list. Returns where to forward such a request so the code is
 * handled (and a failure is shown) by /auth/callback instead of being silently
 * dropped by whatever page it landed on. Null when nothing should change.
 */
export function strayAuthCodeRedirect(pathname: string, search: string): string | null {
  if (pathname === "/auth/callback" || pathname === "/auth/confirm") return null;
  const q = new URLSearchParams(search);
  const code = q.get("code");
  // Supabase auth codes are UUIDs; anything else is not ours to touch.
  if (!code || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) return null;
  return `/auth/callback?${q.toString()}`;
}

/**
 * After a `?code=` link: true when the session in hand came from this link (signed in
 * within the last few minutes) rather than an older sign-in that was already in the
 * browser. A link opened in a different browser can't be exchanged, and must not look
 * like it worked just because someone was already signed in.
 */
export function sessionIsFresh(lastSignInAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!lastSignInAt) return false;
  const t = new Date(lastSignInAt).getTime();
  return Number.isFinite(t) && now - t < 5 * 60 * 1000;
}
