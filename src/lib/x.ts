type XAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getXAuthConfig(): XAuthConfig {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  const siteUrl =
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!clientId || !clientSecret || !siteUrl) {
    throw new Error(
      "Missing TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET / SITE_URL env vars"
    );
  }

  const redirectUri = `${siteUrl}/api/auth/x/callback`;

  return { clientId, clientSecret, redirectUri };
}

export async function refreshXTokens(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const { clientId, clientSecret } = getXAuthConfig();

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`X token refresh error: ${data.error} - ${data.error_description}`);
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

export async function getXAccessToken(params: {
  refreshToken: string;
  accessToken?: string | null;
  expiresAt?: string | null;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const { refreshToken, accessToken, expiresAt } = params;

  // If we have a valid access token that's not expired, use it
  if (accessToken && expiresAt) {
    const expiry = new Date(expiresAt);
    // Add 5 minute buffer
    if (expiry.getTime() - 5 * 60 * 1000 > Date.now()) {
      return {
        accessToken,
        refreshToken,
        expiresAt: expiry,
      };
    }
  }

  // Otherwise refresh
  const tokens = await refreshXTokens(refreshToken);

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
}
