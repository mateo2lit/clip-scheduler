type InstagramAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export function getInstagramAuthConfig(): InstagramAuthConfig {
  // Prefer dedicated Instagram app credentials, fall back to Facebook ones
  const appId = process.env.INSTAGRAM_APP_ID || process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.FACEBOOK_APP_SECRET;

  console.log(
    `[instagram-auth-config] appId source=${process.env.INSTAGRAM_APP_ID ? "INSTAGRAM_APP_ID" : "FACEBOOK_APP_ID"} appIdLen=${appId?.length ?? 0} ` +
      `appSecret source=${process.env.INSTAGRAM_APP_SECRET ? "INSTAGRAM_APP_SECRET" : "FACEBOOK_APP_SECRET"} appSecretLen=${appSecret?.length ?? 0}`
  );

  const siteUrl =
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!appId || !appSecret || !siteUrl) {
    throw new Error(
      "Missing INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET / SITE_URL env vars"
    );
  }

  const redirectUri = `${siteUrl}/api/auth/instagram/callback`;

  return { appId, appSecret, redirectUri };
}

/**
 * Exchange authorization code for a short-lived Instagram token.
 * Uses the Instagram API endpoint (not Facebook).
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; user_id: string }> {
  const { appId, appSecret } = getInstagramAuthConfig();

  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instagram token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error_type || data.error_message) {
    throw new Error(`Instagram token error: ${data.error_message || data.error_type}`);
  }

  // Instagram API with Instagram Login wraps the result in a `data` array,
  // unlike the legacy Basic Display API's flat response shape.
  const result = Array.isArray(data.data) ? data.data[0] : data;

  console.log(
    `[instagram-code-exchange] topLevelKeys=${Object.keys(data).join(",")} wrapped=${Array.isArray(data.data)} ` +
      `resultKeys=${result ? Object.keys(result).join(",") : "n/a"} tokenPrefix=${result?.access_token ? String(result.access_token).slice(0, 6) : "n/a"} tokenLen=${result?.access_token ? String(result.access_token).length : 0}`
  );

  if (!result?.access_token) {
    throw new Error("Instagram token error: missing access_token in response");
  }

  return {
    access_token: result.access_token,
    user_id: String(result.user_id),
  };
}

/**
 * Exchange short-lived token for a long-lived token (~60 days).
 * Uses the Instagram Graph API endpoint.
 */
export async function exchangeForLongLivedToken(shortToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const { appSecret } = getInstagramAuthConfig();

  console.log(
    `[instagram-long-lived-exchange] shortTokenPrefix=${shortToken ? shortToken.slice(0, 6) : "n/a"} shortTokenLen=${shortToken?.length ?? 0} appSecretLen=${appSecret?.length ?? 0}`
  );

  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: shortToken,
  });

  const res = await fetch(
    `https://graph.instagram.com/access_token?${params.toString()}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instagram long-lived token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`Instagram token exchange error: ${data.error.message}`);
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 5184000, // default 60 days
  };
}

/**
 * Refresh a long-lived Instagram token.
 * Can be refreshed after 24 hours, before it expires.
 */
export async function refreshInstagramToken(token: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: token,
  });

  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?${params.toString()}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instagram token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`Instagram token refresh error: ${data.error.message}`);
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 5184000,
  };
}

/**
 * Get the authenticated user's Instagram profile info.
 */
export async function getInstagramProfile(accessToken: string): Promise<{
  id: string;
  username: string;
  profilePictureUrl: string | null;
}> {
  const res = await fetch(
    `https://graph.instagram.com/me?fields=id,user_id,username,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instagram profile fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`Instagram profile error: ${data.error.message}`);
  }

  return {
    id: String(data.user_id || data.id),
    username: data.username || "",
    profilePictureUrl: data.profile_picture_url || null,
  };
}
