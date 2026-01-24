import { google, youtube_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

type YouTubeAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function getYouTubeAuthConfig(): YouTubeAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!clientId || !clientSecret || !siteUrl) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / NEXT_PUBLIC_SITE_URL env vars"
    );
  }

  // Must match your OAuth callback route
  const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

  return { clientId, clientSecret, redirectUri };
}

/**
 * Creates an OAuth2 client authenticated for a specific user via refresh_token.
 * Per Google’s OAuth2 client behavior, if refresh_token is set, the library can
 * obtain fresh access tokens as needed. :contentReference[oaicite:1]{index=1}
 */
export async function getYouTubeOAuthClient(params: {
  refreshToken: string;
}): Promise<OAuth2Client> {
  const { clientId, clientSecret, redirectUri } = getYouTubeAuthConfig();

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({
    refresh_token: params.refreshToken,
  });

  // Force a token fetch now so we fail fast if refresh token is invalid/revoked
  // and to capture expiry/access_token for optional DB updates.
  await oauth2Client.getAccessToken();

  return oauth2Client;
}

export function getYouTubeApi(auth: OAuth2Client): youtube_v3.Youtube {
  return google.youtube({ version: "v3", auth });
}

/**
 * Best-effort extraction of access_token + expiry from the OAuth2 client after refresh.
 */
export function readOAuthTokens(auth: OAuth2Client): {
  accessToken?: string;
  expiresAt?: Date;
} {
  const creds: any = auth.credentials ?? {};
  const accessToken: string | undefined = creds.access_token;
  const expiryDateMs: number | undefined = creds.expiry_date;

  return {
    accessToken,
    expiresAt: typeof expiryDateMs === "number" ? new Date(expiryDateMs) : undefined,
  };
}
