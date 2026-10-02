import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { supabaseAdmin as db } from "./supabaseAdmin";
import { getTeamContext, requireOwnerOrAdmin } from "./teamAuth";
import { getYouTubeOAuthClient, getYouTubeApi } from "./youtube";
import { resolveYouTubeIdentity, verifyYouTubeIdentity, type YouTubeIdentity } from "./youtubeIdentity";
import { ATTEMPT_TTL_SECONDS, browserCookieName, hashBinding, isAttemptId, openCredentials, sealCredentials, signAttempt, verifyAttemptState } from "./youtubeConnectionCrypto";

type Context = { userId: string; teamId: string; role: string };
type Attempt = {
  id: string; user_id: string; team_id: string; browser_hash: string;
  expected_account_id: string | null; expected_channel_id: string | null;
  return_path: "/settings" | "/onboarding"; status: string; expires_at: string;
  credential_envelope: string | null; identity: YouTubeIdentity; account_id: string | null;
};
type Credentials = {
  refreshToken: string; previousAccountId: string | null; previousRefreshToken: string | null;
};

export function youtubeSiteUrl(req: Request) {
  return (process.env.SITE_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
}

function client(req: Request) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error("Missing YouTube configuration");
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${youtubeSiteUrl(req)}/api/auth/youtube/callback`);
}

export const connectionJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function audit(event: string, attemptId: string) {
  console.log(JSON.stringify({ event: `youtube.connection.${event}`, attemptId }));
}

export async function startYouTubeAttempt(req: Request, ctx: Context) {
  const body = await req.json().catch(() => ({}));
  let expected: { id: string; platform_user_id: string } | null = null;
  if (body.accountId) {
    if (!isAttemptId(body.accountId)) return connectionJson({ ok: false, error: "Invalid account" }, 400);
    const result = await db.from("platform_accounts").select("id, platform_user_id")
      .eq("id", body.accountId).eq("team_id", ctx.teamId).eq("provider", "youtube").maybeSingle();
    if (result.error || !result.data?.platform_user_id) return connectionJson({ ok: false, error: "YouTube account not found" }, 404);
    expected = result.data;
  }
  const recent = await db.from("youtube_connection_attempts").select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId).gte("created_at", new Date(Date.now() - ATTEMPT_TTL_SECONDS * 1000).toISOString());
  if (recent.error) throw new Error("YouTube connection storage unavailable");
  if ((recent.count || 0) >= 8) return connectionJson({ ok: false, error: "Too many connection attempts. Please try again in 15 minutes." }, 429);
  const id = crypto.randomUUID();
  // Validate key configuration before sending the creator through Google.
  sealCredentials(id, {});
  const binding = crypto.randomBytes(32).toString("base64url");
  const returnPath = body.returnPath === "/settings" ? "/settings" : body.returnPath === "/onboarding" || cookies().get("clip-onboarding")?.value === "1" ? "/onboarding" : "/settings";
  const state = signAttempt(id);
  const oauth = client(req);
  const url = oauth.generateAuthUrl({ access_type: "offline", prompt: "consent", include_granted_scopes: true,
    scope: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube", "https://www.googleapis.com/auth/youtube.force-ssl"], state });
  const { error } = await db.from("youtube_connection_attempts").insert({ id, user_id: ctx.userId, team_id: ctx.teamId,
    browser_hash: hashBinding(binding), expected_account_id: expected?.id || null, expected_channel_id: expected?.platform_user_id || null, return_path: returnPath });
  if (error) throw new Error("YouTube connection storage unavailable");
  audit("started", id);
  const response = connectionJson({ ok: true, url, redirectUri: `${youtubeSiteUrl(req)}/api/auth/youtube/callback` });
  response.cookies.set(browserCookieName(id), binding, { httpOnly: true, secure: new URL(youtubeSiteUrl(req)).protocol === "https:", sameSite: "lax", path: "/api/auth/youtube", maxAge: ATTEMPT_TTL_SECONDS });
  return response;
}

export async function handleYouTubeCallback(req: Request) {
  let claimedId: string | null = null;
  let returnPath = "/settings";
  try {
    const params = new URL(req.url).searchParams;
    const id = verifyAttemptState(params.get("state") || "");
    const { data: attempt, error } = await db.from("youtube_connection_attempts").select("*").eq("id", id).maybeSingle();
    if (error || !attempt || attempt.status !== "started" || Date.parse(attempt.expires_at) <= Date.now()) throw new Error("Invalid attempt");
    const binding = cookies().get(browserCookieName(id))?.value;
    if (!binding || hashBinding(binding) !== attempt.browser_hash) throw new Error("Invalid browser");
    returnPath = attempt.return_path;
    const { data: member, error: memberError } = await db.from("team_members").select("role")
      .eq("user_id", attempt.user_id).eq("team_id", attempt.team_id).maybeSingle();
    if (memberError || !member || requireOwnerOrAdmin(member.role)) throw new Error("Permission changed");
    const claim = await db.from("youtube_connection_attempts").update({ status: "exchanging" })
      .eq("id", id).eq("status", "started").gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (claim.error || !claim.data) throw new Error("Attempt already consumed");
    claimedId = id;
    const code = params.get("code");
    if (params.get("error") || !code) throw new Error("Authorization denied");
    const oauth = client(req);
    const { tokens } = await oauth.getToken(code);
    oauth.setCredentials(tokens);
    const identity = await resolveYouTubeIdentity(getYouTubeApi(oauth));
    if (attempt.expected_channel_id && identity.channelId !== attempt.expected_channel_id) throw new Error("Wrong reconnect channel");
    const existing = await db.from("platform_accounts").select("id, refresh_token")
      .eq("team_id", attempt.team_id).eq("provider", "youtube").eq("platform_user_id", identity.channelId).maybeSingle();
    if (existing.error) throw new Error("Account lookup failed");
    const refreshToken = tokens.refresh_token || existing.data?.refresh_token;
    if (!refreshToken) throw new Error("Missing refresh token");
    const payload: Credentials = { refreshToken, previousAccountId: existing.data?.id || null, previousRefreshToken: existing.data?.refresh_token || null };
    const saved = await db.from("youtube_connection_attempts").update({ status: "awaiting_confirmation", identity, previous_account_id: existing.data?.id || null, credential_envelope: sealCredentials(id, payload) })
      .eq("id", id).eq("status", "exchanging").gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (saved.error || !saved.data) throw new Error("Attempt expired or cancelled");
    audit("awaiting_confirmation", id);
    const response = NextResponse.redirect(`${youtubeSiteUrl(req)}/youtube/confirm?attempt=${id}`);
    response.cookies.set(browserCookieName(id), "", { path: "/api/auth/youtube", maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    if (claimedId) {
      await db.from("youtube_connection_attempts").update({ status: "failed", credential_envelope: null }).eq("id", claimedId).eq("status", "exchanging");
      audit("failed", claimedId);
    }
    return NextResponse.redirect(`${youtubeSiteUrl(req)}${returnPath}?error=youtube_confirmation_failed`);
  }
}

async function authorizedAttempt(req: Request): Promise<{ attempt: Attempt; ctx: Context } | NextResponse> {
  const context = await getTeamContext(req);
  if (!context.ok) return context.error;
  const denied = requireOwnerOrAdmin(context.ctx.role);
  if (denied) return denied;
  const input = req.method === "GET" ? { attemptId: new URL(req.url).searchParams.get("attempt") } : await req.json().catch(() => ({}));
  if (!isAttemptId(input.attemptId)) return connectionJson({ ok: false, error: "Invalid connection attempt" }, 400);
  const { data, error } = await db.from("youtube_connection_attempts").select("*").eq("id", input.attemptId)
    .eq("user_id", context.ctx.userId).eq("team_id", context.ctx.teamId).maybeSingle();
  if (error || !data) return connectionJson({ ok: false, error: "Connection attempt not found" }, 404);
  if (data.status !== "confirmed" && Date.parse(data.expires_at) <= Date.now()) {
    await db.from("youtube_connection_attempts").update({ status: "expired", credential_envelope: null }).eq("id", data.id).in("status", ["started", "exchanging", "awaiting_confirmation"]);
    audit("expired", data.id);
    return connectionJson({ ok: false, error: "This connection attempt expired. Please connect YouTube again." }, 410);
  }
  return { attempt: data as Attempt, ctx: context.ctx };
}

export async function pendingYouTubeConnection(req: Request, action: "preview" | "confirm" | "cancel") {
  try {
    const result = await authorizedAttempt(req);
    if (result instanceof NextResponse) return result;
    const { attempt: a, ctx } = result;
    const redirectPath = `${a.return_path}?connected=youtube`;
    if (a.status === "confirmed") return connectionJson({ ok: true, status: "confirmed", accountId: a.account_id, redirectPath });
    if (action === "cancel") {
      const cancelled = await db.from("youtube_connection_attempts").update({ status: "cancelled", credential_envelope: null })
        .eq("id", a.id).in("status", ["started", "exchanging", "awaiting_confirmation", "cancelled"]).select("id").maybeSingle();
      if (cancelled.error || !cancelled.data) return connectionJson({ ok: false, error: "Connection changed. Refresh this page." }, 409);
      audit("cancelled", a.id);
      return connectionJson({ ok: true, redirectPath: a.return_path });
    }
    if (a.status !== "awaiting_confirmation" || !a.credential_envelope) return connectionJson({ ok: false, error: "This attempt is no longer pending. Please connect YouTube again." }, 409);
    if (action === "preview") return connectionJson({ ok: true, status: a.status, identity: a.identity, reconnect: Boolean(a.expected_account_id), returnPath: a.return_path, expiresAt: a.expires_at });
    const credential = openCredentials<Credentials>(a.id, a.credential_envelope);
    const oauth = await getYouTubeOAuthClient({ refreshToken: credential.refreshToken });
    await verifyYouTubeIdentity(getYouTubeApi(oauth), a.identity.channelId);
    const { data: accountId, error } = await db.rpc("confirm_youtube_connection", {
      p_attempt_id: a.id, p_user_id: ctx.userId, p_team_id: ctx.teamId,
      p_refresh_token: credential.refreshToken, p_access_token: oauth.credentials.access_token || null,
      p_expiry: oauth.credentials.expiry_date ? new Date(oauth.credentials.expiry_date).toISOString() : null,
      p_previous_account_id: credential.previousAccountId, p_previous_refresh_token: credential.previousRefreshToken,
    });
    if (error || !accountId) return connectionJson({ ok: false, error: "Connection changed or expired. Please start a fresh YouTube connection." }, 409);
    audit("confirmed", a.id);
    const response = connectionJson({ ok: true, accountId, redirectPath });
    if (a.return_path === "/onboarding") response.cookies.set("clip-onboarding", "", { path: "/", maxAge: 0 });
    return response;
  } catch {
    return connectionJson({ ok: false, error: "Could not verify this YouTube connection. Please retry or choose another account." }, 503);
  }
}
