type LinkedInAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getLinkedInAuthConfig(): LinkedInAuthConfig {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  const siteUrl =
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!clientId || !clientSecret || !siteUrl) {
    throw new Error(
      "Missing LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / SITE_URL env vars"
    );
  }

  const redirectUri = `${siteUrl}/api/auth/linkedin/callback`;

  return { clientId, clientSecret, redirectUri };
}

/**
 * Exchange authorization code for an access token.
 * LinkedIn OAuth 2.0 returns access_token + expires_in.
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const { clientId, clientSecret } = getLinkedInAuthConfig();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`LinkedIn token error: ${data.error_description || data.error}`);
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 5184000,
  };
}

/**
 * Get the authenticated user's LinkedIn profile (name, sub/ID, picture).
 * Uses the OpenID Connect userinfo endpoint.
 */
export async function getLinkedInProfile(accessToken: string): Promise<{
  sub: string;
  name: string;
  picture: string | null;
}> {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn profile fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  return {
    sub: data.sub,
    name: data.name || `${data.given_name || ""} ${data.family_name || ""}`.trim(),
    picture: data.picture || null,
  };
}

/**
 * Refresh a LinkedIn access token.
 * LinkedIn supports refresh tokens for apps with the refresh_token grant type.
 */
export async function refreshLinkedInToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  const { clientId, clientSecret } = getLinkedInAuthConfig();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`LinkedIn token refresh error: ${data.error_description || data.error}`);
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: data.refresh_token,
  };
}
