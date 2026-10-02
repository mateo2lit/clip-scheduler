import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, FakeNextResponse as NextResponse, memoryDb } from "./helpers/load-ts.mjs";

const ID = "UC" + "a".repeat(22);
const ctx = { userId: "u", teamId: "t", role: "owner" };
const req = () => new Request("https://clipdash.test/api/platform-accounts");
const teamAuth = { getTeamContext: async () => ({ ok: true, ctx }), requireOwnerOrAdmin: role => role === "member" ? NextResponse.json({}, { status: 403 }) : null };

function accountRoute({ metadata = true, enabled = true } = {}) {
  const db = memoryDb({
    platform_accounts: [
      { id: "yt", team_id: "t", provider: "youtube", platform_user_id: ID, profile_name: "My custom label", label: "My custom label", refresh_token: "secret" },
      { id: "fb", team_id: "t", provider: "facebook", page_id: "page", profile_name: "Facebook Page", refresh_token: "secret" },
      { id: "ig", team_id: "t", provider: "instagram", avatar_url: "old-avatar", profile_name: "Instagram" },
      { id: "other", team_id: "another-team", provider: "youtube", platform_user_id: "other" },
    ],
    youtube_account_identity: metadata ? [{ platform_account_id: "yt", title: "Real channel", custom_url: "@Current", verified_at: "2026-10-01T00:00:00Z" }] : [],
  });
  const route = loadTs("src/app/api/platform-accounts/route.ts", {
    "next/server": { NextResponse }, "@/lib/supabaseAdmin": { supabaseAdmin: db }, "@/lib/teamAuth": teamAuth,
    "@/lib/youtubeIdentity": { youtubeFeatureEnabled: () => enabled },
  });
  return { db, route };
}
test("Account API adds verified YouTube identity without overwriting a custom label or leaking tokens", async () => {
  const f = accountRoute(); const result = await (await f.route.GET(req())).json();
  assert.equal(result.data.length, 3); assert.equal(result.data[0].profile_name, "My custom label");
  assert.equal(result.data[0].youtube_identity.title, "Real channel"); assert.equal(result.data[0].youtube_identity.channelId, ID);
  assert.equal(result.data[0].youtube_identity.customUrl, "@Current"); assert.equal(result.youtubeConfirmationEnabled, true);
  assert.ok(!JSON.stringify(result).includes("secret")); assert.ok(!JSON.stringify(result).includes("another-team"));
});
test("Other providers keep their avatar mapping and do not gain YouTube fields", async () => {
  const f = accountRoute(); const { data } = await (await f.route.GET(req())).json();
  assert.deepEqual(data.find(a => a.id === "fb"), { id: "fb", provider: "facebook", profile_name: "Facebook Page", avatar_url: "https://graph.facebook.com/page/picture?type=large" });
  assert.deepEqual(data.find(a => a.id === "ig"), { id: "ig", provider: "instagram", profile_name: "Instagram", avatar_url: "/api/avatar-live?id=ig" });
});
test("Missing optional metadata keeps legacy accounts visible with stable channel links", async () => {
  const f = accountRoute({ metadata: false }); const { data } = await (await f.route.GET(req())).json();
  assert.equal(data[0].youtube_identity.channelId, ID); assert.equal(data[0].youtube_identity.verifiedAt, null);
});
test("Flag off does not query new metadata tables", async () => {
  const f = accountRoute({ enabled: false }); await f.route.GET(req());
  assert.ok(!f.db.calls.some(q => q.table === "youtube_account_identity"));
});
test("Optional metadata query failure does not break connected accounts", async () => {
  const f = accountRoute(); const original = f.db.from;
  f.db.from = table => table === "youtube_account_identity" ? { select: () => ({ in: async () => ({ data: null, error: { message: "migration not installed" } }) }) } : original(table);
  const response = await f.route.GET(req()); assert.equal(response.status, 200); assert.equal((await response.json()).data.length, 3);
});

function startRoute(enabled, role = "owner") {
  let attempts = 0, oldStates = 0;
  const route = loadTs("src/app/api/auth/youtube/start/route.ts", {
    "next/server": { NextResponse }, googleapis: { google: { auth: { OAuth2: class { generateAuthUrl() { return "https://google.test/legacy"; } } } } },
    "@/lib/supabaseAdmin": {}, "@/lib/teamAuth": { ...teamAuth, getTeamContext: async () => ({ ok: true, ctx: { ...ctx, role } }) },
    "@/lib/oauthState": { generateOAuthState: () => { oldStates++; return "legacy-state"; } },
    "@/lib/youtubeIdentity": { youtubeFeatureEnabled: () => enabled },
    "@/lib/youtubeConnection": { startYouTubeAttempt: async () => { attempts++; return NextResponse.json({ ok: true, url: "https://google.test/new" }); } },
  }, { process: { env: { GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret" } } });
  return { route, counts: () => ({ attempts, oldStates }) };
}
test("Rollout off retains legacy OAuth start; on uses pending flow", async () => {
  const old = startRoute(false); await old.route.POST(req()); assert.deepEqual(old.counts(), { attempts: 0, oldStates: 1 });
  const fresh = startRoute(true); await fresh.route.POST(req()); assert.deepEqual(fresh.counts(), { attempts: 1, oldStates: 0 });
});
test("A member cannot start either OAuth flow", async () => {
  for (const enabled of [false, true]) {
    const f = startRoute(enabled, "member"); assert.equal((await f.route.POST(req())).status, 403); assert.deepEqual(f.counts(), { attempts: 0, oldStates: 0 });
  }
});
