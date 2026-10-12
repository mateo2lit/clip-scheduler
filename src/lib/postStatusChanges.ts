/**
 * Works out which posts changed between two refreshes of the Scheduled page, so it can
 * pop "N posts failed to publish" / "N posts published" notices.
 *
 * - A post counts as newly failed only if it was already on screen with another status.
 *   A post the page has never seen (or one the user just removed, coming back in a
 *   refresh that started before the delete) is not a new failure.
 * - A post that left the list only *may* have been published: it could also have been
 *   removed, cancelled or turned into a draft. These are returned as `vanished` for the
 *   caller to check against the database, and posts the user removed here are skipped.
 *
 * Import-free so it can be unit-tested standalone (scripts/test-post-status-changes.mjs).
 */
export function postStatusChanges(
  known: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>,
  removedHere: ReadonlySet<string>
): { newlyFailed: string[]; vanished: string[] } {
  const newlyFailed: string[] = [];
  for (const [id, status] of current) {
    if (status !== "failed" || removedHere.has(id)) continue;
    const before = known.get(id);
    if (before !== undefined && before !== "failed") newlyFailed.push(id);
  }
  const vanished: string[] = [];
  for (const id of known.keys()) {
    if (!current.has(id) && !removedHere.has(id)) vanished.push(id);
  }
  return { newlyFailed, vanished };
}
