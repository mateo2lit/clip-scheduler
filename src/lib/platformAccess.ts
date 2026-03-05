export function parseCsvAllowlist(raw: string | undefined | null): Set<string> {
  return new Set(
    String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isThreadsEnabledForUserId(
  userId: string | null | undefined,
  rawAllowlist?: string | null
): boolean {
  if (!userId) return false;
  const allow = parseCsvAllowlist(rawAllowlist ?? process.env.THREADS_ALLOWED_USER_IDS);
  return allow.has(userId);
}

export function isThreadsEnabledForUserIdClient(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const allow = parseCsvAllowlist(process.env.NEXT_PUBLIC_THREADS_ALLOWED_USER_IDS);
  return allow.has(userId);
}

