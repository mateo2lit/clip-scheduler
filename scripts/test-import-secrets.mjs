// Run: node --test scripts/test-import-secrets.mjs
// The repo is public, so workflow_dispatch inputs and run logs are public. These tests prove the
// clip import never hands WORKER_SECRET to the runner: Kick MP4s get a signed, expiring proxy link,
// the proxy only accepts that signature, and import-clip.yml never pastes values into its scripts.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = "worker-secret-value-123";
const SITE = "https://clipdash.test";
const CDN_MP4 = "https://kick-clips.example/clip_01ABC/video.mp4?x=1&y=2";

/** Transpiles a TS module and runs it with the given mocks; unmocked imports and network calls throw. */
function loadModule(relative, mocks, { network = [], env = {} } = {}) {
  const pendingNetwork = [...network];
  const requests = [];
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const exports = {};
  const context = vm.createContext({
    exports, URL, URLSearchParams, Request, Response, Headers, Promise, Buffer,
    AbortController, setTimeout, clearTimeout, Date,
    process: { env },
    console: { error() {}, warn() {}, log() {} },
    require(specifier) {
      if (specifier === "crypto") return crypto;
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier === "@/lib/workerSecret") return { getWorkerSecret: () => (env.WORKER_SECRET ?? "").trim(), getCronSecret: () => (env.CRON_SECRET ?? "").trim() };
      throw new Error(`Unmocked import blocked: ${specifier}`);
    },
    async fetch(url, options) {
      requests.push({ url: String(url), options });
      const next = pendingNetwork.shift();
      if (!next) throw new Error(`Unmocked network call blocked: ${url}`);
      if (next.raw) return next.raw;
      return Response.json(next.body ?? {}, { status: next.status ?? 200 });
    },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return { exports, requests, pendingNetwork };
}

const env = { WORKER_SECRET: SECRET, GITHUB_PAT: "ghp_test", GITHUB_REPO: "owner/repo", NEXT_PUBLIC_SITE_URL: SITE };
const signing = () => loadModule("src/lib/kickProxySignature.ts", {}, { env }).exports;

function fakeDb() {
  const answers = {
    teams: { data: { plan: "creator", plan_status: "active" }, error: null },
    uploads: { data: [], error: null },
    import_jobs: { data: { id: "job-1" }, error: null },
  };
  return {
    from(table) {
      const chain = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") return (resolve) => resolve(answers[table]);
          return () => chain;
        },
      });
      return chain;
    },
  };
}

async function importKickClip(clipUrl) {
  const route = loadModule("src/app/api/imports/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabaseAdmin": { supabaseAdmin: fakeDb() },
    "@/lib/teamAuth": { getTeamContext: async () => ({ ok: true, ctx: { userId: "user-1", teamId: "team-1" } }) },
    "@/lib/storageLimits": { storageLimitBytes: () => 1e12 },
    "@/lib/kickProxySignature": signing(),
  }, {
    env,
    network: [
      { body: { ok: true, clip_url: clipUrl, title: "Big play", duration: 42 } }, // kick-proxy (Vercel → Vercel)
      { body: {} }, // GitHub workflow_dispatch
    ],
  });
  const res = await route.exports.POST(new Request(`${SITE}/api/imports`, {
    method: "POST", body: JSON.stringify({ url: "https://kick.com/streamer/clips/clip_01ABC" }),
  }));
  assert.equal(res.status, 200, await res.clone().text());
  const dispatch = route.requests.find((r) => r.url.includes("/actions/workflows/import-clip.yml/dispatches"));
  assert.ok(dispatch, "workflow was dispatched");
  return { body: dispatch.options.body, inputs: JSON.parse(dispatch.options.body).inputs };
}

function assertNoSecret(text) {
  for (const form of [SECRET, encodeURIComponent(SECRET), Buffer.from(SECRET).toString("base64")]) {
    assert.ok(!text.includes(form), `dispatch body leaks WORKER_SECRET (${form})`);
  }
  assert.ok(!/[?&]token=/.test(text), "dispatch body carries a token= parameter");
}

test("Kick MP4 import dispatches a signed proxy link, never WORKER_SECRET", async () => {
  const { body, inputs } = await importKickClip(CDN_MP4);
  assertNoSecret(body);
  const link = new URL(inputs.direct_url);
  assert.equal(link.origin + link.pathname, `${SITE}/api/kick-video-proxy`);
  assert.equal(link.searchParams.get("url"), CDN_MP4);
  const verified = signing().verifyKickVideoProxyParams(link.searchParams);
  assert.equal(verified.ok, true);
  assert.equal(verified.url, CDN_MP4);
});

test("Kick HLS import passes the CDN URL straight through, with no secret", async () => {
  const hls = "https://clips.kick.example/clip_01ABC/playlist.m3u8";
  const { body, inputs } = await importKickClip(hls);
  assertNoSecret(body);
  assert.equal(inputs.direct_url, hls);
});

function proxyRequest(query) {
  const nextUrl = new URL(`${SITE}/api/kick-video-proxy?${query}`);
  return { nextUrl, headers: new Headers() };
}

function loadProxy(network = []) {
  return loadModule("src/app/api/kick-video-proxy/route.ts", {
    "next/server": {},
    "@/lib/kickProxySignature": signing(),
  }, { env, network });
}

test("kick-video-proxy streams a validly signed link", async () => {
  const link = new URL(signing().signKickVideoProxyUrl(SITE, CDN_MP4));
  const proxy = loadProxy([{ raw: new Response("video-bytes", { status: 200, headers: { "content-type": "video/mp4" } }) }]);
  const res = await proxy.exports.GET(proxyRequest(link.searchParams));
  assert.equal(res.status, 200);
  assert.equal(proxy.requests[0].url, CDN_MP4);
});

test("kick-video-proxy rejects the raw token, a swapped url, and an expired link", async () => {
  const { signKickVideoProxyUrl } = signing();
  const cases = {
    rawToken: new URLSearchParams({ token: SECRET, url: CDN_MP4 }),
    swappedUrl: (() => {
      const p = new URL(signKickVideoProxyUrl(SITE, CDN_MP4)).searchParams;
      p.set("url", "https://evil.example/anything");
      return p;
    })(),
    expired: new URL(signKickVideoProxyUrl(SITE, CDN_MP4, -60)).searchParams,
    noSignature: new URLSearchParams({ url: CDN_MP4 }),
  };
  for (const [name, params] of Object.entries(cases)) {
    const proxy = loadProxy();
    const res = await proxy.exports.GET(proxyRequest(params));
    assert.equal(res.status, 403, name);
    assert.equal(proxy.requests.length, 0, `${name} reached the CDN`);
  }
});

test("import-clip.yml never pastes inputs, step outputs or secrets into run scripts", () => {
  const yml = fs.readFileSync(path.join(root, ".github/workflows/import-clip.yml"), "utf8");
  assert.ok(!/echo\s+"?direct_url=/.test(yml), "workflow echoes direct_url");
  const lines = yml.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (!line.includes("${{") || line.trim().startsWith("#")) continue;
    assert.match(line, /^\s+[A-Z_]+: \$\{\{ [A-Za-z_.]+ \}\}\s*$/, `line ${i + 1} uses an expression outside env: ${line.trim()}`);
  }
});
