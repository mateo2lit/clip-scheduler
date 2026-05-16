/**
 * Translate raw platform API errors stored in scheduled_posts.last_error
 * into short, action-oriented messages safe to show in the UI.
 *
 * Keep both inputs and outputs short — the UI truncates to one line.
 * The raw error is still stored in the DB and shown on hover.
 */

const PROVIDER_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
};

function label(provider: string | null | undefined): string {
  if (!provider) return "Platform";
  return PROVIDER_LABELS[provider.toLowerCase()] || provider;
}

export function humanizePostError(
  provider: string | null | undefined,
  raw: string | null | undefined
): string {
  if (!raw) return "Failed";
  const r = raw.toLowerCase();
  const name = label(provider);

  // ── Auth / token errors ────────────────────────────────────────────────────
  if (
    r.includes("session has been revoked") ||
    r.includes("token has been revoked") ||
    r.includes("tokenrevoked")
  ) {
    return `${name} disconnected — reconnect in Settings`;
  }
  if (
    r.includes("expired_access_token") ||
    r.includes("session has expired") ||
    r.includes("token has expired") ||
    r.includes("oauthexception")
  ) {
    return `${name} login expired — reconnect in Settings`;
  }
  if (r.includes("invalid_grant") || r.includes("invalid_token")) {
    return `${name} authentication invalid — reconnect in Settings`;
  }
  if (
    r.includes("not connected") ||
    r.includes("no platform account") ||
    r.includes("account not found")
  ) {
    return `${name} not connected — connect in Settings`;
  }

  // ── Rate limits ────────────────────────────────────────────────────────────
  if (r.includes("rate limit") || r.includes("429") || r.includes("too many requests")) {
    return `${name} rate limit hit — try again later`;
  }

  // ── Provider-specific media errors ────────────────────────────────────────
  if (provider === "bluesky") {
    if (
      r.includes("invalidmimetype") ||
      (r.includes("video/mp4") && r.includes("video/quicktime")) ||
      r.includes("expected \"video/mp4\"")
    ) {
      return "Video format not accepted by Bluesky — try a true MP4 file";
    }
    if (r.includes("blob") && r.includes("size")) {
      return "Video too large for Bluesky (50 MB max)";
    }
  }
  if (provider === "instagram") {
    if (r.includes("media processing failed")) {
      return "Instagram couldn't process the video — check format/length";
    }
    if (r.includes("aspect ratio")) {
      return "Instagram rejected the aspect ratio";
    }
    if (r.includes("duration")) {
      return "Instagram rejected the video length";
    }
  }
  if (provider === "youtube") {
    if (r.includes("quotaexceeded")) {
      return "YouTube daily upload quota exceeded";
    }
    if (r.includes("uploadlimitexceeded")) {
      return "YouTube upload limit reached";
    }
  }
  if (provider === "tiktok") {
    if (r.includes("video_pull_failed")) {
      return "TikTok couldn't fetch the video — try again";
    }
    if (r.includes("spam_risk") || r.includes("spam risk")) {
      return "TikTok flagged the post as spam";
    }
  }
  if (provider === "facebook") {
    if (r.includes("page access token") || r.includes("page_id")) {
      return "Facebook page permission issue — reconnect";
    }
  }
  if (provider === "linkedin") {
    if (r.includes("restricted_member") || r.includes("member is restricted")) {
      return "LinkedIn restricted your account — check linkedin.com for verification prompts";
    }
    if (r.includes("video init failed")) {
      return "LinkedIn rejected the video upload";
    }
  }

  // ── Generic HTTP status codes ─────────────────────────────────────────────
  if (/\b401\b/.test(r)) return `${name} authentication failed — reconnect`;
  if (/\b403\b/.test(r)) return `${name} permission denied`;
  if (/\b404\b/.test(r)) return `${name} resource not found`;
  if (/\b413\b/.test(r)) return `Video too large for ${name}`;
  if (/\b5\d\d\b/.test(r)) return `${name} server error — will retry`;

  // ── Network ───────────────────────────────────────────────────────────────
  if (r.includes("econnrefused") || r.includes("network") || r.includes("fetch failed")) {
    return `Network error reaching ${name}`;
  }

  // ── Fallback: take first sentence/line, strip JSON, cap length ───────────
  const stripped = raw
    .replace(/\{[^}]*\}/g, "") // drop JSON-ish blobs
    .replace(/\s+/g, " ")
    .trim();
  const firstClause = stripped.split(/[:;]/)[0]?.trim() || stripped;
  return firstClause.length > 80 ? firstClause.slice(0, 77) + "…" : firstClause || "Post failed";
}
