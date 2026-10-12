/**
 * Platforms where one post may go to only one connected account.
 *
 * X's Developer Policy says "Never post identical or substantially similar
 * content across multiple accounts", and makes the developer responsible for
 * designing the service so its users can't do it. Breaking it risks the users'
 * X accounts and our whole X API access, so Buffer, Hootsuite and the other
 * schedulers allow only one X account per post; so do we.
 *
 * The uploads page enforces this in its account picker and the create route
 * enforces it again per group, so a stale tab or a direct API call can't get
 * around it.
 *
 * Import-free so it can be unit-tested standalone.
 */
export const ONE_ACCOUNT_PER_POST: Record<string, string> = {
  x: "X doesn't allow the same post on more than one account, so it can go to one X account at a time.",
};

export function isOneAccountPerPost(provider: string | null | undefined): boolean {
  return Object.prototype.hasOwnProperty.call(ONE_ACCOUNT_PER_POST, String(provider ?? "").trim().toLowerCase());
}
