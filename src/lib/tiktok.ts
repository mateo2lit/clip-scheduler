type TikTokAuthConfig = {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
};

export function getTikTokAuthConfig(): TikTokAuthConfig {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  const siteUrl =
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!clientKey || !clientSecret || !siteUrl) {
    throw new Error(
      "Missing TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / SITE_URL env vars"
    );
  }

  const redirectUri = `${siteUrl}/api/auth/tiktok/callback`;

  return { clientKey, clientSecret, redirectUri };
}

export async function refreshTikTokTokens(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
}> {
  const { clientKey, clientSecret } = getTikTokAuthConfig();

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TikTok token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`TikTok token refresh error: ${data.error} - ${data.error_description}`);
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    open_id: data.open_id,
  };
}

export async function getTikTokAccessToken(params: {
  refreshToken: string;
  accessToken?: string | null;
  expiresAt?: string | null;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  openId: string;
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
        openId: "",
        expiresAt: expiry,
      };
    }
  }

  // Otherwise refresh
  const tokens = await refreshTikTokTokens(refreshToken);

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    openId: tokens.open_id,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
}
