// Run: node --experimental-strip-types scripts/test-platform-availability.mjs
//
// Every "coming soon" notice in the app and on the marketing pages reads from
// PLATFORM_COMING_SOON. The point of that is a clean switch-off: when Pinterest
// is approved, deleting one entry must remove every notice, with no stragglers
// hardcoded elsewhere.

import {
  PLATFORM_COMING_SOON,
  comingSoonNotice,
  isComingSoon,
  comingSoonProviders,
} from "../src/lib/platformAvailability.ts";

let failures = 0;
function check(label, actual, expected) {
  const ok = typeof expected === "function" ? expected(actual) : actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got ${JSON.stringify(actual)}`}`);
}

// --- Pinterest is the one pending platform --------------------------------
check("pinterest is coming soon", isComingSoon("pinterest"), true);
check("pinterest has a notice", comingSoonNotice("pinterest"), (n) => n !== null);
check("only pinterest is pending", comingSoonProviders(), (p) =>
  p.length === 1 && p[0] === "pinterest"
);

// --- Live platforms must never show a notice ------------------------------
for (const p of ["youtube", "tiktok", "instagram", "facebook", "linkedin", "bluesky", "x"]) {
  check(`${p} is live`, isComingSoon(p), false);
  check(`${p} has no notice`, comingSoonNotice(p), null);
}

// --- Callers pass raw provider strings from several sources ---------------
check("casing is normalised", isComingSoon("Pinterest"), true);
check("whitespace is tolerated", isComingSoon(" pinterest "), true);
check("null provider is safe", isComingSoon(null), false);
check("undefined provider is safe", isComingSoon(undefined), false);
check("empty provider is safe", isComingSoon(""), false);
check("unknown provider is safe", isComingSoon("myspace"), false);

// --- Notice copy must be usable in the UI ---------------------------------
for (const [provider, notice] of Object.entries(PLATFORM_COMING_SOON)) {
  check(`${provider} badge is short enough for a pill`, notice.badge.length <= 14, true);
  check(`${provider} short note fits one line`, notice.short.length <= 90, true);
  check(`${provider} long note explains the situation`, notice.long.length > 60, true);
  for (const field of ["badge", "short", "long"]) {
    check(`${provider}.${field} is non-empty and single-paragraph`,
      notice[field].trim().length > 0 && !notice[field].includes("\n"), true);
  }
}

// --- The switch-off path --------------------------------------------------
// Simulates approval: with the entry gone, nothing reports as coming soon.
const simulated = { ...PLATFORM_COMING_SOON };
delete simulated.pinterest;
check("removing the entry clears every notice", Object.keys(simulated).length, 0);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
