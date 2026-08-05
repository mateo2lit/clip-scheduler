// Run: node --experimental-strip-types scripts/test-post-error-messages.mjs
//
// A missing OAuth scope arrives as HTTP 401 and was falling through to the
// generic "authentication failed - reconnect". That is actively misleading: the
// token is fine, and reconnecting cannot help until the app requests the scope.
// It cost a real debugging session — the user reconnected repeatedly because the
// message told them to.

import { humanizePostError } from "../src/lib/postErrorMessages.ts";

let failures = 0;
function check(label, actual, expected) {
  const ok = typeof expected === "function" ? expected(actual) : actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got ${JSON.stringify(actual)}`}`);
}

// --- The real production error --------------------------------------------
const REAL =
  `Pinterest pin creation failed: 401 {"code":3,"message":"Your token does not have ` +
  `sufficient permissions to perform this operation. Please ensure your token is ` +
  `authorized with the correct set of scopes. Missing: ['boards:write']"}`;

check(
  "scope error names the missing permission",
  humanizePostError("pinterest", REAL),
  (s) => s.includes("boards:write")
);
check(
  "scope error says permission, not authentication",
  humanizePostError("pinterest", REAL),
  (s) => /permission/i.test(s) && !/authentication failed/i.test(s)
);
check(
  "scope error still tells the user to reconnect",
  humanizePostError("pinterest", REAL),
  (s) => /reconnect/i.test(s)
);
check(
  "scope error is one short line",
  humanizePostError("pinterest", REAL),
  (s) => s.length <= 90 && !s.includes("\n")
);

// --- Scope errors without a parseable scope name --------------------------
check(
  "generic insufficient-permission 401 is still recognised",
  humanizePostError("pinterest", '401 {"message":"Your token does not have sufficient permissions"}'),
  (s) => /permission/i.test(s) && /reconnect/i.test(s)
);

// --- A real expired token must NOT be relabelled as a scope problem -------
check(
  "plain 401 still reads as authentication failure",
  humanizePostError("pinterest", "Pinterest pin creation failed: 401 Unauthorized"),
  "Pinterest authentication failed — reconnect"
);
check(
  "revoked token message is unchanged",
  humanizePostError("pinterest", "Token has been revoked"),
  "Pinterest disconnected — reconnect in Settings"
);

// --- Other status codes unaffected ----------------------------------------
check("403 unchanged", humanizePostError("pinterest", "403 forbidden"), "Pinterest permission denied");
check("404 unchanged", humanizePostError("pinterest", "404 not found"), "Pinterest resource not found");
check("500 unchanged", humanizePostError("pinterest", "500 oops"), "Pinterest server error — will retry");
check("empty error unchanged", humanizePostError("pinterest", ""), "Failed");

// --- Works for any provider, not just Pinterest ---------------------------
check(
  "scope handling is provider-agnostic",
  humanizePostError("tiktok", `401 {"message":"insufficient scopes. Missing: ['video.publish']"}`),
  (s) => s.startsWith("TikTok") && s.includes("video.publish")
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
