function getSiteUrl() {
  return (
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  );
}

export function getPinterestAuthConfig() {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  const siteUrl = getSiteUrl();

  if (!clientId || !clientSecret || !siteUrl) {
    throw new Error("Missing PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET / NEXT_PUBLIC_SITE_URL env vars");
  }

  const redirectUri = `${siteUrl}/api/auth/pinterest/callback`;
  return { clientId, clientSecret, redirectUri };
}

export async function exchangePinterestCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = getPinterestAuthConfig();

  const res = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token ?? null) as string | null,
    expires_in: (data.expires_in ?? 2592000) as number,
  };
}

export async function getPinterestUser(accessToken: string) {
  const res = await fetch("https://api.pinterest.com/v5/user_account", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest profile fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    username: data.username as string,
    profile_image: (data.profile_image ?? null) as string | null,
  };
}
