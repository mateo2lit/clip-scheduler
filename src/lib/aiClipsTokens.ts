import { createHmac, timingSafeEqual } from "crypto";

const SECRET_ENV = "OAUTH_STATE_SECRET";
const TOKEN_TTL_SECONDS = 4 * 60 * 60; // 4 hours

function getSecret(): string {
  const s = process.env[SECRET_ENV];
  if (!s) throw new Error(`${SECRET_ENV} is not set`);
  return s;
}

function hmacHex(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function signChunkUploadToken(
  jobId: string,
  userId: string,
  ttlSeconds = TOKEN_TTL_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${jobId}:${userId}:${exp}`;
  return `${payload}:${hmacHex(payload)}`;
}

export type VerifyResult =
  | { ok: true; jobId: string; userId: string }
  | { ok: false; reason: "malformed" | "expired" | "bad_signature" };

export function verifyChunkUploadToken(token: string): VerifyResult {
  const parts = token.split(":");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };
  const [jobId, userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, reason: "malformed" };
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };

  const expected = hmacHex(`${jobId}:${userId}:${exp}`);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true, jobId, userId };
}
