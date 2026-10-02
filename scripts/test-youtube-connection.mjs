import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { loadTs, FakeNextResponse as NextResponse, memoryDb } from "./helpers/load-ts.mjs";

const ID = "UC" + "a".repeat(22), OTHER = "UC" + "b".repeat(22);
const userId = crypto.randomUUID(), teamId = crypto.randomUUID(), accountId = crypto.randomUUID();
const env = { OAUTH_STATE_SECRET: "test-only", YOUTUBE_CONNECTION_ENCRYPTION_KEY: "ab".repeat(32), GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", SITE_URL: "https://clipdash.test" };
const crypt = loadTs("src/lib/youtubeConnectionCrypto.ts", { "node:crypto": crypto }, { process: { env } });
const identity = loadTs("src/lib/youtubeIdentity.ts");

function setup(options = {}) {
  const db = memoryDb({ team_members: [{ user_id: userId, team_id: teamId, role: options.role || "owner" }], platform_accounts: options.accounts || [] });
  let current = { userId, teamId, role: options.role || "owner" };
  const jar = new Map(); const effects = { exchange: 0, refreshed: 0 };
  const api = { channels: { list: async () => ({ data: { items: options.channels || [{ id: ID, snippet: { title: "Current channel", customUrl: "@Current" } }] } }) } };
  class OAuth {
    credentials = { access_token: "new-access", expiry_date: Date.now() + 3600000 };
    generateAuthUrl(opts) { effects.auth = opts; return "https://accounts.google.test/authorize"; }
    async getToken() { effects.exchange++; return { tokens: options.tokens || { access_token: "access", refresh_token: "new-refresh" } }; }
    setCredentials() {}
  }
  const auth = {
    getTeamContext: async () => current ? { ok: true, ctx: current } : { ok: false, error: NextResponse.json({ ok: false }, { status: 401 }) },
    requireOwnerOrAdmin: role => ["owner", "admin"].includes(role) ? null : NextResponse.json({ ok: false }, { status: 403 }),
  };
  const lib = loadTs("src/lib/youtubeConnection.ts", {
    "node:crypto": crypto, "next/headers": { cookies: () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) },
    "next/server": { NextResponse }, googleapis: { google: { auth: { OAuth2: OAuth } } }, "./supabaseAdmin": { supabaseAdmin: db },
    "./teamAuth": auth, "./youtubeIdentity": identity, "./youtubeConnectionCrypto": crypt,
    "./youtube": { getYouTubeApi: () => options.refreshMismatch && effects.refreshed ? { channels: { list: async () => ({ data: { items: [{ id: OTHER }] } }) } } : api,
      getYouTubeOAuthClient: async () => { effects.refreshed++; return new OAuth(); } },
  }, { process: { env } });
  const req = (method = "POST", body = {}) => new Request("https://clipdash.test/api/auth/youtube/confirm", { method, headers: { "Content-Type": "application/json" }, ...(method !== "GET" ? { body: JSON.stringify(body) } : {}) });
  return { db, jar, effects, lib, req, auth, setCurrent: value => { current = value; },
    async start(body = {}) {
      const response = await lib.startYouTubeAttempt(req("POST", body), current);
      for (const [name, value] of response.cookies.values) jar.set(name, value);
      return response;
    },
    async callback(state = effects.auth.state) { return lib.handleYouTubeCallback(new Request(`https://clipdash.test/api/auth/youtube/callback?state=${encodeURIComponent(state)}&code=code`)); },
    pending() {
      const id = crypto.randomUUID();
      const a = { id, user_id: userId, team_id: teamId, status: "awaiting_confirmation", return_path: "/settings", expires_at: new Date(Date.now() + 900000).toISOString(), identity: { channelId: ID, title: "Current channel", customUrl: "@Current", avatarUrl: null },
        credential_envelope: crypt.sealCredentials(id, { refreshToken: "secret-refresh", previousAccountId: null, previousRefreshToken: null }) };
      (db.tables.youtube_connection_attempts ||= []).push(a); return a;
    },
  };
}

test("Start binds user/team/browser and preserves existing OAuth scopes and response contract", async () => {
  const s = setup(); const res = await s.start(); const body = await res.json();
  assert.equal(res.status, 200); assert.ok(body.url); assert.equal(body.redirectUri, env.SITE_URL + "/api/auth/youtube/callback");
  const row = s.db.tables.youtube_connection_attempts[0]; assert.equal(row.user_id, userId); assert.equal(row.team_id, teamId);
  assert.equal(s.effects.auth.access_type, "offline"); assert.equal(s.effects.auth.scope.length, 3);
  assert.equal(res.cookies.values[0][2].httpOnly, true); assert.equal(res.cookies.values[0][2].secure, true);
  assert.ok(!body.url.includes("secret")); assert.equal(s.db.tables.platform_accounts.length, 0);
});
test("Start denies cross-team targeted reconnect and throttles attempts", async () => {
  const s = setup({ accounts: [{ id: accountId, team_id: "another-team", provider: "youtube", platform_user_id: ID }] });
  assert.equal((await s.start({ accountId })).status, 404);
  for (let i = 0; i < 8; i++) await s.start();
  assert.equal((await s.start()).status, 429);
});
test("Callback creates only a pending connection, then rejects replay", async () => {
  const s = setup(); await s.start();
  assert.match((await s.callback()).headers.get("location"), /youtube\/confirm\?attempt=/);
  const a = s.db.tables.youtube_connection_attempts[0]; assert.equal(a.status, "awaiting_confirmation");
  assert.ok(!a.credential_envelope.includes("new-refresh")); assert.equal(s.db.tables.platform_accounts.length, 0);
  await s.callback(); assert.equal(s.effects.exchange, 1); assert.equal(a.status, "awaiting_confirmation");
});
for (const problem of ["browser", "signature", "expired", "permission"]) test(`Callback rejects ${problem} before exchanging code`, async () => {
  const s = setup(); await s.start(); let state = s.effects.auth.state;
  if (problem === "browser") s.jar.clear();
  if (problem === "signature") state += "x";
  if (problem === "expired") s.db.tables.youtube_connection_attempts[0].expires_at = new Date(0).toISOString();
  if (problem === "permission") s.db.tables.team_members[0].role = "member";
  assert.match((await s.callback(state)).headers.get("location"), /error=youtube_confirmation_failed/); assert.equal(s.effects.exchange, 0);
});
test("Targeted reconnect rejects a different channel without changing old credentials", async () => {
  const account = { id: accountId, provider: "youtube", team_id: teamId, platform_user_id: OTHER, refresh_token: "old-refresh" };
  const s = setup({ accounts: [account] }); await s.start({ accountId }); await s.callback();
  assert.equal(s.db.tables.youtube_connection_attempts[0].status, "failed"); assert.equal(account.refresh_token, "old-refresh");
});
test("Missing refresh token falls back only to the exact existing channel", async () => {
  const s = setup({ tokens: { access_token: "access" }, accounts: [{ id: accountId, team_id: teamId, provider: "youtube", platform_user_id: ID, refresh_token: "old-refresh" }] });
  await s.start(); await s.callback();
  const a = s.db.tables.youtube_connection_attempts[0]; assert.equal(crypt.openCredentials(a.id, a.credential_envelope).refreshToken, "old-refresh");
  const bad = setup({ tokens: { access_token: "access" }, accounts: [{ id: accountId, team_id: teamId, provider: "youtube", platform_user_id: OTHER, refresh_token: "wrong-refresh" }] });
  await bad.start(); await bad.callback(); assert.equal(bad.db.tables.youtube_connection_attempts[0].status, "failed");
});
test("Concurrent callbacks exchange an authorization code only once", async () => {
  const s = setup(); await s.start(); await Promise.all([s.callback(), s.callback()]); assert.equal(s.effects.exchange, 1);
});
test("Preview returns only identity, never credentials; cancel clears pending secrets", async () => {
  const s = setup(); const a = s.pending();
  const response = await s.lib.pendingYouTubeConnection(s.req("POST", { attemptId: a.id }), "preview");
  const text = await response.text(); assert.ok(text.includes("@Current")); assert.ok(!text.includes("secret-refresh")); assert.ok(!text.includes("credential_envelope"));
  assert.equal(response.headers.get("cache-control"), "no-store");
  const cancel = await s.lib.pendingYouTubeConnection(s.req("POST", { attemptId: a.id }), "cancel"); assert.equal(cancel.status, 200);
  assert.equal(a.credential_envelope, null); assert.equal(a.status, "cancelled"); assert.equal(s.db.rpcCalls.length, 0);
});
for (const invalid of ["user", "team", "member", "signed-out"]) test(`Pending endpoints reject ${invalid} access`, async () => {
  const s = setup(); const a = s.pending();
  s.setCurrent(invalid === "signed-out" ? null : { userId: invalid === "user" ? "other" : userId, teamId: invalid === "team" ? "other" : teamId, role: invalid === "member" ? "member" : "owner" });
  const result = await s.lib.pendingYouTubeConnection(s.req("POST", { attemptId: a.id }), "confirm");
  assert.ok([401, 403, 404].includes(result.status)); assert.equal(s.effects.refreshed, 0); assert.equal(s.db.rpcCalls.length, 0);
});
test("Expired attempts clear secrets and cannot be confirmed", async () => {
  const s = setup(); const a = s.pending(); a.expires_at = new Date(0).toISOString();
  assert.equal((await s.lib.pendingYouTubeConnection(s.req("POST", { attemptId: a.id }), "confirm")).status, 410);
  assert.equal(a.credential_envelope, null); assert.equal(s.db.rpcCalls.length, 0);
});
test("Confirmation verifies the refresh credential before the atomic commit", async () => {
  const s = setup(); const a = s.pending();
  const response = await s.lib.pendingYouTubeConnection(s.req("POST", { attemptId: a.id, channelId: OTHER, refreshToken: "attacker" }), "confirm");
  assert.equal(response.status, 200); assert.equal(s.effects.refreshed, 1); assert.equal(s.db.rpcCalls.length, 1);
  assert.equal(s.db.rpcCalls[0].args.p_refresh_token, "secret-refresh"); assert.equal(s.db.rpcCalls[0].args.p_user_id, userId);
  assert.equal(s.db.rpcCalls[0].args.p_attempt_id, a.id);
});
test("Mismatched refresh credential never reaches commit", async () => {
  const s = setup({ refreshMismatch: true }); const a = s.pending();
  assert.equal((await s.lib.pendingYouTubeConnection(s.req("POST", { attemptId: a.id }), "confirm")).status, 503); assert.equal(s.db.rpcCalls.length, 0);
});
test("Confirmed attempt replay returns the original ID without refreshing or writing", async () => {
  const s = setup(); const a = s.pending(); a.status = "confirmed"; a.account_id = accountId; a.credential_envelope = null;
  for (const action of ["confirm", "cancel", "preview"]) {
    const res = await s.lib.pendingYouTubeConnection(s.req("POST", { attemptId: a.id }), action);
    assert.equal((await res.json()).accountId, accountId);
  }
  assert.equal(s.effects.refreshed, 0); assert.equal(s.db.rpcCalls.length, 0);
});
test("Settings return path overrides a stale onboarding cookie; external destinations cannot be supplied", async () => {
  const s = setup(); s.jar.set("clip-onboarding", "1"); await s.start({ returnPath: "/settings" });
  assert.equal(s.db.tables.youtube_connection_attempts[0].return_path, "/settings");
  s.jar.clear(); await s.start({ returnPath: "https://evil.test" }); assert.equal(s.db.tables.youtube_connection_attempts[1].return_path, "/settings");
});
