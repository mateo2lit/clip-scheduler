import crypto from "node:crypto";

export function getXConsumerKeys() {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("Missing TWITTER_API_KEY / TWITTER_API_SECRET env vars");
  }
  return { apiKey, apiSecret };
}

// RFC 3986 percent encoding (encodeURIComponent misses ! ' ( ) *)
function pct(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

/**
 * Build an OAuth 1.0a Authorization header.
 *
 * @param extraSignedParams  URL-encoded form params or query params to include
 *                           in the signature base string (NOT for JSON or multipart bodies).
 * @param oauthVerifier      Include as an oauth_verifier param in the header+signature.
 * @param oauthCallback      Include as an oauth_callback param in the header+signature.
 */
export function buildOAuth1Header(
  method: string,
  url: string,
  apiKey: string,
  apiSecret: string,
  options: {
    accessToken?: string;
    accessTokenSecret?: string;
    oauthCallback?: string;
    oauthVerifier?: string;
    extraSignedParams?: Record<string, string>;
  } = {}
): string {
  const { accessToken, accessTokenSecret, oauthCallback, oauthVerifier, extraSignedParams = {} } = options;

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };

  if (accessToken) oauthParams.oauth_token = accessToken;
  if (oauthCallback) oauthParams.oauth_callback = oauthCallback;
  if (oauthVerifier) oauthParams.oauth_verifier = oauthVerifier;

  // Signature base string includes oauth params + any extra URL-encoded params
  const allParams = { ...oauthParams, ...extraSignedParams };

  const sortedParams = Object.keys(allParams)
    .sort()
    .map((k) => `${pct(k)}=${pct(allParams[k])}`)
    .join("&");

  const baseString = [method.toUpperCase(), pct(url), pct(sortedParams)].join("&");

  const signingKey = `${pct(apiSecret)}&${pct(accessTokenSecret ?? "")}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  oauthParams.oauth_signature = signature;

  return (
    "OAuth " +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${pct(k)}="${pct(oauthParams[k])}"`)
      .join(", ")
  );
}
