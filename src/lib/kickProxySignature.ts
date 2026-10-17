import { createHmac, timingSafeEqual } from "crypto";

// Signed, expiring links to /api/kick-video-proxy.
//
// GitHub Actions runners download Kick MP4s through Vercel because Kick's CDN blocks
// runner IPs. The repo is public, so every workflow input and log line is public too:
// the link a runner gets must never contain WORKER_SECRET. Instead it carries an HMAC
// (keyed by WORKER_SECRET) that only unlocks one CDN URL for a few hours.

const SECRET_ENV = "WORKER_SECRET";
const LINK_TTL_SECONDS = 3 * 60 * 60; // queue wait + 30 min job timeout, with room to spare

function getSecret(): string {
  const s = process.env[SECRET_ENV];
  if (!s) throw new Error(`${SECRET_ENV} is not set`);
  return s;
}

function sign(url: string, exp: number): string {
  return createHmac("sha256", getSecret()).update(`kick-video-proxy:${exp}:${url}`).digest("hex");
}

export function signKickVideoProxyUrl(
  siteUrl: string,
  cdnUrl: string,
  ttlSeconds = LINK_TTL_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const params = new URLSearchParams({ url: cdnUrl, exp: String(exp), sig: sign(cdnUrl, exp) });
  return `${siteUrl}/api/kick-video-proxy?${params}`;
}

export type VerifyResult =
  | { ok: true; url: string }
  | { ok: false; reason: "malformed" | "expired" | "bad_signature" };

export function verifyKickVideoProxyParams(params: URLSearchParams): VerifyResult {
  const url = params.get("url");
  const exp = Number(params.get("exp"));
  const sig = params.get("sig") ?? "";
  if (!url || !Number.isFinite(exp) || !/^[0-9a-f]{64}$/.test(sig)) return { ok: false, reason: "malformed" };
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };

  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(sign(url, exp), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };
  return { ok: true, url };
}
