type ThreadsAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export function getThreadsAuthConfig(): ThreadsAuthConfig {
  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;

  const siteUrl =
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!appId || !appSecret || !siteUrl) {
    throw new Error("Missing THREADS_APP_ID / THREADS_APP_SECRET / SITE_URL env vars");
  }

  const redirectUri = `${siteUrl}/api/auth/threads/callback`;
  return { appId, appSecret, redirectUri };
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; user_id: string }> {
  const { appId, appSecret } = getThreadsAuthConfig();

  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Threads token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Threads token error: ${data.error.message || data.error}`);

  return { access_token: data.access_token, user_id: String(data.user_id) };
}

export async function exchangeForLongLivedToken(shortToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const { appSecret } = getThreadsAuthConfig();

  const params = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: appSecret,
    access_token: shortToken,
  });

  const res = await fetch(`https://graph.threads.net/access_token?${params.toString()}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Threads long-lived token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Threads token exchange error: ${data.error.message || data.error}`);

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 5184000, // ~60 days default
  };
}

export async function getThreadsProfile(accessToken: string): Promise<{
  id: string;
  username: string;
  profilePictureUrl: string | null;
}> {
  const res = await fetch(
    `https://graph.threads.net/me?fields=id,username,threads_profile_picture_url&access_token=${encodeURIComponent(accessToken)}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Threads profile fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Threads profile error: ${data.error.message || data.error}`);

  return {
    id: String(data.id),
    username: data.username || "",
    profilePictureUrl: data.threads_profile_picture_url || null,
  };
}
