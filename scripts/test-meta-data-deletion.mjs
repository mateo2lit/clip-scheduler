// Run: node --test scripts/test-meta-data-deletion.mjs
// Meta's data-deletion callback (POST /api/account/delete): Meta sends a form-encoded,
// HMAC-signed `signed_request`. Loads the real route with a mocked database.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FB_SECRET = "fb-app-secret";
const IG_SECRET = "ig-app-secret";

function fakeDb() {
  const queries = [];
  return {
    queries,
    from(table) {
      const q = { table, ops: [], args: [] };
      queries.push(q);
      const chain = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") return (resolve) => resolve({ data: null, error: null });
          return (...args) => { q.ops.push(prop); q.args.push([prop, ...args]); return chain; };
        },
      });
      return chain;
    },
  };
}

function loadRoute(db) {
  const relative = "src/app/api/account/delete/route.ts";
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const exports = {};
  const mocks = {
    crypto,
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabaseAdmin": { supabaseAdmin: db },
    "@/lib/teamAuth": { getTeamContext: async () => ({ ok: false }) },
    "@/lib/stripe": { getStripe: () => ({}) },
  };
  const context = vm.createContext({
    exports, URL, URLSearchParams, Request, Response, Headers, Promise, Buffer, JSON, Date, String,
    process: { env: { FACEBOOK_APP_SECRET: FB_SECRET, INSTAGRAM_APP_SECRET: IG_SECRET, SITE_URL: "https://clipdash.test" } },
    console: { error() {}, warn() {}, log() {} },
    require(s) { if (Object.hasOwn(mocks, s)) return mocks[s]; throw new Error(`Unmocked import blocked: ${s}`); },
    async fetch(url) { throw new Error(`Unmocked network call blocked: ${url}`); },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return exports;
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function signedRequest(payload, secret) {
  const encoded = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", secret).update(encoded).digest());
  return `${sig}.${encoded}`;
}
const formPost = (sr) => new Request("https://clipdash.test/api/account/delete", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ signed_request: sr }).toString(),
});
const deletes = (db) => db.queries.filter((q) => q.table === "platform_accounts" && q.ops.includes("delete"))
  .map((q) => q.args.filter(([op]) => op === "eq").map(([, col, v]) => `${col}=${v}`).join(" "));

const payload = { algorithm: "HMAC-SHA256", issued_at: 1790000000, user_id: "1234567890" };

test("Meta deletion: a form-encoded Facebook request deletes that person's Facebook connections", async () => {
  const db = fakeDb();
  const res = await loadRoute(db).POST(formPost(signedRequest(payload, FB_SECRET)));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.confirmation_code, /^del_1234567890_\d+$/);
  assert.equal(body.url, `https://clipdash.test/privacy?deletion=${body.confirmation_code}`);
  assert.deepEqual(deletes(db), ["provider=facebook meta_user_id=1234567890"]);
});

test("Meta deletion: an Instagram request deletes Instagram connections, including older rows", async () => {
  const db = fakeDb();
  const res = await loadRoute(db).POST(formPost(signedRequest(payload, IG_SECRET)));
  assert.equal(res.status, 200);
  assert.deepEqual(deletes(db), ["provider=instagram meta_user_id=1234567890", "provider=instagram ig_user_id=1234567890"]);
});

test("Meta deletion: a forged or tampered request deletes nothing", async () => {
  for (const sr of [
    signedRequest(payload, "attacker-secret"),
    // valid signature, payload swapped for someone else's ID
    signedRequest(payload, FB_SECRET).split(".")[0] + "." + b64url(JSON.stringify({ ...payload, user_id: "999" })),
  ]) {
    const db = fakeDb();
    const res = await loadRoute(db).POST(formPost(sr));
    assert.equal(res.status, 403);
    assert.deepEqual(deletes(db), []);
  }
});

test("Meta deletion: malformed requests get a 400, not a 500", async () => {
  for (const body of ["", "signed_request=nodot", "signed_request=" + encodeURIComponent(signedRequest({ ...payload, user_id: "1 or 1=1" }, FB_SECRET))]) {
    const db = fakeDb();
    const res = await loadRoute(db).POST(new Request("https://clipdash.test/api/account/delete", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    }));
    assert.equal(res.status, 400, `body: ${body.slice(0, 40)}`);
    assert.deepEqual(deletes(db), []);
  }
});
