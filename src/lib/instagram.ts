import { exchangeForLongLivedToken } from "./facebook";

type InstagramAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export function getInstagramAuthConfig(): InstagramAuthConfig {
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

  const redirectUri = `${siteUrl}/api/auth/instagram/callback`;

  return { appId, appSecret, redirectUri };
}

export { exchangeForLongLivedToken };

/**
 * Fetch Instagram Business accounts linked to the user's Facebook Pages.
 */
export async function getInstagramAccounts(accessToken: string): Promise<
  Array<{
    igUserId: string;
    pageId: string;
    pageName: string;
    pageAccessToken: string;
  }>
> {
  // Fetch pages with their connected IG business accounts
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(accessToken)}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Facebook pages fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`Facebook pages error: ${data.error.message}`);
  }

  const results: Array<{
    igUserId: string;
    pageId: string;
    pageName: string;
    pageAccessToken: string;
  }> = [];

  for (const page of data.data || []) {
    if (page.instagram_business_account?.id) {
      results.push({
        igUserId: page.instagram_business_account.id,
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
      });
    }
  }

  return results;
}
