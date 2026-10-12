// Run: node --experimental-strip-types --test scripts/test-auth-links.mjs
// Auth email links. A reset link that Supabase sent to "/?code=..." used to load the
// homepage, fail silently, and leave people thinking their password was reset.
import test from "node:test";
import assert from "node:assert/strict";
import { readConfirmParams, confirmDestination, strayAuthCodeRedirect, sessionIsFresh } from "../src/lib/authLinks.ts";

const code = "bd32066b-07b6-457c-8637-0449ac9d38da";

test("a stray ?code= on the homepage is handed to /auth/callback, keeping every parameter", () => {
  assert.equal(strayAuthCodeRedirect("/", `?code=${code}`), `/auth/callback?code=${code}`);
  assert.equal(strayAuthCodeRedirect("/pricing", `?code=${code}&next=%2Freset-password`), `/auth/callback?code=${code}&next=%2Freset-password`);
});

test("pages that already handle auth, and codes that aren't Supabase's, are left alone", () => {
  assert.equal(strayAuthCodeRedirect("/auth/callback", `?code=${code}`), null);
  assert.equal(strayAuthCodeRedirect("/auth/confirm", `?code=${code}`), null);
  assert.equal(strayAuthCodeRedirect("/", ""), null);
  assert.equal(strayAuthCodeRedirect("/", "?code=SUMMER25"), null); // e.g. a promo code
});

test("token-hash links are read, and only known types are accepted", () => {
  assert.deepEqual(readConfirmParams(new URLSearchParams("token_hash=abc&type=recovery")), { tokenHash: "abc", type: "recovery", next: null });
  assert.equal(readConfirmParams(new URLSearchParams("token_hash=abc&type=hack")), null);
  assert.equal(readConfirmParams(new URLSearchParams("type=recovery")), null);
});

test("next only allows same-site paths", () => {
  const read = (n) => readConfirmParams(new URLSearchParams(`token_hash=a&type=email&next=${encodeURIComponent(n)}`)).next;
  assert.equal(read("/settings"), "/settings");
  assert.equal(read("https://evil.example"), null);
  assert.equal(read("//evil.example"), null);
});

test("after confirming: next wins, else new users onboard and others go to the dashboard", () => {
  assert.equal(confirmDestination({ next: "/settings" }, true), "/settings");
  assert.equal(confirmDestination({ next: null }, true), "/onboarding");
  assert.equal(confirmDestination({ next: null }, false), "/dashboard");
});

test("an old sign-in doesn't count as the link having worked", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  assert.equal(sessionIsFresh("2026-10-12T11:59:00Z", now), true);
  assert.equal(sessionIsFresh("2026-10-10T09:00:00Z", now), false);
  assert.equal(sessionIsFresh(null, now), false);
  assert.equal(sessionIsFresh("not a date", now), false);
});
