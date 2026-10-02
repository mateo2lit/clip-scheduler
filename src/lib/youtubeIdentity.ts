import type { youtube_v3 } from "googleapis";

export type YouTubeIdentity = {
  channelId: string;
  title: string;
  customUrl: string | null;
  avatarUrl: string | null;
};

export class YouTubeIdentityError extends Error {
  constructor(public code: "unavailable" | "missing" | "ambiguous" | "mismatch") {
    super(code === "unavailable"
      ? "YouTube channel verification is temporarily unavailable. Please retry this post later."
      : "YouTube channel identity could not be verified. Please reconnect the intended channel before retrying.");
    this.name = "YouTubeIdentityError";
  }
}

export function youtubeFeatureEnabled(feature: "CONFIRMATION" | "IDENTITY_ENFORCEMENT", teamId: string): boolean {
  return process.env[`YOUTUBE_${feature}_ENABLED`] === "true" ||
    (process.env[`YOUTUBE_${feature}_TEAM_IDS`] || "").split(",").map(s => s.trim()).filter(Boolean).includes(teamId);
}

// The same authenticated client must be used for this lookup and the subsequent upload.
export async function resolveYouTubeIdentity(youtube: Pick<youtube_v3.Youtube, "channels">): Promise<YouTubeIdentity> {
  let data: youtube_v3.Schema$ChannelListResponse;
  try {
    ({ data } = await youtube.channels.list(
      { part: ["snippet"], mine: true, maxResults: 2 },
      { timeout: 8000, retry: false },
    ));
  } catch {
    // Never propagate Google errors that may contain request headers or credentials.
    throw new YouTubeIdentityError("unavailable");
  }
  const items = data.items || [];
  if (data.nextPageToken || items.length > 1) throw new YouTubeIdentityError("ambiguous");
  const channel = items[0];
  if (!channel?.id || !/^UC[A-Za-z0-9_-]{22}$/.test(channel.id)) throw new YouTubeIdentityError("missing");
  return {
    channelId: channel.id,
    title: channel.snippet?.title || "YouTube channel",
    customUrl: channel.snippet?.customUrl || null,
    avatarUrl: channel.snippet?.thumbnails?.default?.url || null,
  };
}

export async function verifyYouTubeIdentity(youtube: Pick<youtube_v3.Youtube, "channels">, expectedId: string | null | undefined) {
  if (!expectedId) throw new YouTubeIdentityError("missing");
  let identity: YouTubeIdentity;
  try { identity = await resolveYouTubeIdentity(youtube); }
  catch (error) {
    if (!(error instanceof YouTubeIdentityError) || error.code !== "unavailable") throw error;
    await new Promise(resolve => setTimeout(resolve, 250));
    identity = await resolveYouTubeIdentity(youtube);
  }
  if (identity.channelId !== expectedId) throw new YouTubeIdentityError("mismatch");
  return identity;
}
