type FacebookAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export function getFacebookAuthConfig(): FacebookAuthConfig {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  const siteUrl =
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!appId || !appSecret || !siteUrl) {
    throw new Error(
      "Missing FACEBOOK_APP_ID / FACEBOOK_APP_SECRET / SITE_URL env vars"
    );
  }

  const redirectUri = `${siteUrl}/api/auth/facebook/callback`;

  return { appId, appSecret, redirectUri };
}

/**
 * Exchange a short-lived token for a long-lived token (~60 days).
 */
export async function exchangeForLongLivedToken(shortToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const { appId, appSecret } = getFacebookAuthConfig();

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });

  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Facebook long-lived token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`Facebook token exchange error: ${data.error.message}`);
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
  };
}

/**
 * Fetch the user's Facebook Pages.
 */
export async function getFacebookUserPages(accessToken: string): Promise<
  Array<{ id: string; name: string; access_token: string }>
> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(accessToken)}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Facebook pages fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`Facebook pages error: ${data.error.message}`);
  }

  return (data.data || []).map((page: any) => ({
    id: page.id,
    name: page.name,
    access_token: page.access_token,
  }));
}

/**
 * Refresh a long-lived token. Facebook long-lived tokens for pages don't expire
 * if the page token was obtained from a long-lived user token, but user tokens
 * can be refreshed once per day before they expire.
 */
export async function refreshFacebookToken(token: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const { appId, appSecret } = getFacebookAuthConfig();

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: token,
  });

  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Facebook token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`Facebook token refresh error: ${data.error.message}`);
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
  };
}
