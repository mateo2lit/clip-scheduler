// Run: node --test scripts/test-facebook-unselected-pages.mjs
// Reconnecting Facebook with a Page unticked leaves that Page's row in place but unable
// to post. findUnselectedFacebookPages names those rows so the callback can warn at once.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadFacebookLib() {
  const relative = "src/lib/facebook.ts";
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative,
  }).outputText;
  const exports = {};
  const context = vm.createContext({
    exports, Set, Array, String, process: { env: {} },
    require(s) { throw new Error(`Unmocked import blocked: ${s}`); },
    async fetch(url) { throw new Error(`Unmocked network call blocked: ${url}`); },
  });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return exports;
}

const { findUnselectedFacebookPages: find } = loadFacebookLib();
const row = (id, page, meta) => ({ id, page_id: page, platform_user_id: page, meta_user_id: meta });

test("a Page this person connected before and unticked now is reported", () => {
  const saved = [row("r1", "pageA", "me"), row("r2", "pageB", "me")];
  assert.deepEqual([...find(saved, ["pageA"], "me")], ["r2"]);
});

test("nothing is reported when every saved Page is still selected", () => {
  const saved = [row("r1", "pageA", "me"), row("r2", "pageB", "me")];
  assert.deepEqual([...find(saved, ["pageA", "pageB", "pageC"], "me")], []);
});

test("Pages another Facebook profile connected to the team are left alone", () => {
  const saved = [row("r1", "pageA", "me"), row("r2", "pageZ", "someoneElse")];
  assert.deepEqual([...find(saved, ["pageA"], "me")], []);
});

test("rows saved before meta_user_id existed count as this person's", () => {
  const saved = [row("r1", "pageA", "me"), row("r2", "pageB", null)];
  assert.deepEqual([...find(saved, ["pageA"], "me")], ["r2"]);
});

test("nothing is reported when Facebook didn't say who connected", () => {
  const saved = [row("r1", "pageA", "me"), row("r2", "pageB", null)];
  assert.deepEqual([...find(saved, ["pageC"], null)], []);
});

test("platform_user_id is used when page_id is missing", () => {
  const saved = [{ id: "r1", page_id: null, platform_user_id: "pageB", meta_user_id: "me" }];
  assert.deepEqual([...find(saved, ["pageA"], "me")], ["r1"]);
});
