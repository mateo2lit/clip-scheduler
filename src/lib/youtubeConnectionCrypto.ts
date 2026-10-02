import crypto from "node:crypto";

export const ATTEMPT_TTL_SECONDS = 15 * 60;
export const isAttemptId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
export const browserCookieName = (id: string) => `yt-connect-${id}`;
export const hashBinding = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

function secret() {
  const value = process.env.OAUTH_STATE_SECRET;
  if (!value) throw new Error("YouTube connection configuration unavailable");
  return value;
}

function encryptionKey() {
  const value = process.env.YOUTUBE_CONNECTION_ENCRYPTION_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) throw new Error("YouTube connection encryption is not configured");
  return Buffer.from(value, "hex");
}

export function signAttempt(id: string) {
  if (!isAttemptId(id)) throw new Error("Invalid YouTube attempt");
  const payload = `yt1.${id}`;
  return `${payload}.${crypto.createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function verifyAttemptState(state: string) {
  const parts = state.split(".");
  if (parts.length !== 3 || parts[0] !== "yt1" || !isAttemptId(parts[1])) throw new Error("Invalid YouTube state");
  const expected = Buffer.from(signAttempt(parts[1]));
  const given = Buffer.from(state);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw new Error("Invalid YouTube state");
  return parts[1];
}

export function sealCredentials(id: string, value: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(id));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(b => b.toString("base64url")).join(".");
}

export function openCredentials<T>(id: string, value: string): T {
  const [iv, tag, encrypted] = value.split(".").map(s => Buffer.from(s, "base64url"));
  const cipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(id));
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(encrypted), cipher.final()]).toString("utf8"));
}
