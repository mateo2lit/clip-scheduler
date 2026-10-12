// Run: node --experimental-strip-types --test scripts/test-account-storage.mjs
// Templates and presets saved in the browser are kept per account. They used to share one
// slot per browser, so a second account signed in on the same browser saw the first
// account's templates.
import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_STORAGE_KEYS,
  accountStorageKey,
  legacyDismissedKey,
  mergeByKey,
  safeGet,
  safeSet,
  safeRemove,
} from "../src/lib/accountStorage.ts";

function memoryStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    m,
  };
}

test("each account has its own slot, separate from the old shared one", () => {
  const a = accountStorageKey(LEGACY_STORAGE_KEYS.templates, "user-a");
  const b = accountStorageKey(LEGACY_STORAGE_KEYS.templates, "user-b");
  assert.notEqual(a, b);
  assert.notEqual(a, LEGACY_STORAGE_KEYS.templates);

  const store = memoryStore();
  safeSet(store, a, "[A's templates]");
  assert.equal(safeGet(store, b), null, "account B never reads account A's slot");
});

test("'Not mine' is remembered per account and per feature", () => {
  assert.notEqual(legacyDismissedKey("user-a"), legacyDismissedKey("user-b"));
  assert.notEqual(legacyDismissedKey("user-a", "uploads"), legacyDismissedKey("user-a", "subtitles"));
});

test("claiming older items keeps the account's own first and skips duplicates", () => {
  const own = [{ id: "1", name: "mine" }];
  const legacy = [{ id: "1", name: "same id" }, { id: "2", name: "older" }];
  assert.deepEqual(mergeByKey(own, legacy, (t) => t.id), [{ id: "1", name: "mine" }, { id: "2", name: "older" }]);
});

test("blocked storage (private mode) reads as empty instead of crashing the page", () => {
  const broken = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem() { throw new Error("SecurityError"); },
  };
  assert.equal(safeGet(broken, "k"), null);
  assert.doesNotThrow(() => safeSet(broken, "k", "v"));
  assert.doesNotThrow(() => safeRemove(broken, "k"));
  assert.equal(safeGet(null, "k"), null);
});
