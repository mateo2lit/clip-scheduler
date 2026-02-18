import crypto from "node:crypto";

const STATE_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

function getSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error("Missing OAUTH_STATE_SECRET env var");
  return secret;
}

/**
 * Generate a signed OAuth state token containing userId and timestamp.
 * Format: base64url(JSON payload).hmacSignature
 */
export function generateOAuthState(userId: string): string {
  const payload = JSON.stringify({ userId, ts: Date.now() });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

/**
 * Verify a signed OAuth state token and return the userId.
 * Throws if invalid or expired.
 */
export function verifyOAuthState(state: string): string {
  const dotIdx = state.indexOf(".");
  if (dotIdx === -1) throw new Error("Invalid OAuth state format");

  const encoded = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);

  const expectedSig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");

  if (sig !== expectedSig) throw new Error("Invalid OAuth state signature");

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
  const { userId, ts } = payload;

  if (!userId || typeof ts !== "number") {
    throw new Error("Invalid OAuth state payload");
  }

  if (Date.now() - ts > STATE_MAX_AGE_MS) {
    throw new Error("OAuth state expired");
  }

  return userId;
}
