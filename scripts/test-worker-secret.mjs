// Run: node --test scripts/test-worker-secret.mjs
// WORKER_SECRET was saved in Vercel with a trailing space on 2026-10-17. The workers trim the
// token they receive but compared it to the untrimmed env value, so every cron call got
// "Unauthorized worker request" and no posts went out for two days. These tests prove the secret
// is read in one place, trimmed, and that nothing else reads the raw env value.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = "src/lib/workerSecret.ts";

function loadHelper(env) {
  const source = fs.readFileSync(path.join(root, HELPER), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: HELPER,
  }).outputText;
  const exports = {};
  const context = vm.createContext({
    exports, process: { env },
    require(specifier) { throw new Error(`Unexpected import: ${specifier}`); },
  });
  new vm.Script(compiled, { filename: HELPER }).runInContext(context, { timeout: 3000 });
  return exports;
}

test("trims spaces and line breaks pasted into the env value", () => {
  const h = loadHelper({ WORKER_SECRET: "abc123 \n", CRON_SECRET: "\tcron-xyz\r\n" });
  assert.equal(h.getWorkerSecret(), "abc123");
  assert.equal(h.getCronSecret(), "cron-xyz");
});

test("an unset or blank secret reads as empty, so callers fail closed", () => {
  const h = loadHelper({ WORKER_SECRET: "   " });
  assert.equal(h.getWorkerSecret(), "");
  assert.equal(h.getCronSecret(), "");
});

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

test("only the helper reads WORKER_SECRET or CRON_SECRET from the environment", () => {
  const raw = /process\.env\.(WORKER_SECRET|CRON_SECRET)\b|process\.env\[\s*["'](WORKER_SECRET|CRON_SECRET)["']\s*\]|["']WORKER_SECRET["']/;
  const offenders = sourceFiles(path.join(root, "src"))
    .map((f) => path.relative(root, f).split(path.sep).join("/"))
    .filter((f) => f !== HELPER)
    .filter((f) => raw.test(fs.readFileSync(path.join(root, f), "utf8")));
  assert.deepEqual(offenders, [], "read the secret with getWorkerSecret()/getCronSecret() from @/lib/workerSecret");
});
