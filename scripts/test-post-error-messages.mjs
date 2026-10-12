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

// --- Pinterest Trial access ------------------------------------------------
// Arrives as 403 and fell through to "Pinterest permission denied", which reads
// like a board/account permission problem. It is neither: the developer app is
// not approved for production, and no amount of reconnecting or re-permissioning
// the account will change that.
const TRIAL =
  `Pinterest pin creation failed: 403 {"code":29,"message":"Apps with Trial access ` +
  `may not create Pins in production https://api.pinterest.com - use API Sandbox ` +
  `https://api-sandbox.pinterest.com instead."}`;

check(
  "trial-access error mentions Standard access",
  humanizePostError("pinterest", TRIAL),
  (s) => /standard access/i.test(s)
);
check(
  "trial-access error does not read as a generic permission denial",
  humanizePostError("pinterest", TRIAL),
  (s) => s !== "Pinterest permission denied"
);
check(
  "trial-access error does not tell the user to reconnect",
  humanizePostError("pinterest", TRIAL),
  (s) => !/reconnect/i.test(s)
);
check(
  "trial-access error is one short line",
  humanizePostError("pinterest", TRIAL),
  (s) => s.length <= 90 && !s.includes("\n")
);
check(
  "an ordinary pinterest 403 is still a permission denial",
  humanizePostError("pinterest", "403 forbidden"),
  "Pinterest permission denied"
);

// --- Works for any provider, not just Pinterest ---------------------------
check(
  "scope handling is provider-agnostic",
  humanizePostError("tiktok", `401 {"message":"insufficient scopes. Missing: ['video.publish']"}`),
  (s) => s.startsWith("TikTok") && s.includes("video.publish")
);

// --- Meta: only code 190 is a bad login ------------------------------------
// Real error from 2026-10-12: a trial reel on an account below Instagram's follower
// minimum. It is an OAuthException (code 10), and "login expired - reconnect" sent the
// user through three reconnects that could never help.
const IG_TRIAL_REEL =
  `Instagram container creation failed: 400 {"error":{"message":"Application does not have permission for this action",` +
  `"type":"OAuthException","code":10,"error_subcode":2207081,"is_transient":false,` +
  `"error_user_title":"Trial Reel Not Enough Followers","error_user_msg":"The instagram account does not meet the trial reel follower requirement to create trial reels.","fbtrace_id":"x"}}`;
check("trial reel follower minimum is explained, not a reconnect", humanizePostError("instagram", IG_TRIAL_REEL),
  (s) => s.includes("trial reels") && !/reconnect/i.test(s));

const EXPIRED =
  `Instagram container creation failed: 400 {"error":{"message":"Error validating access token: Session has expired on Friday, 28-Aug-26 23:53:23 PDT.",` +
  `"type":"OAuthException","code":190,"error_subcode":0}}`;
check("a real expired Meta login still says reconnect", humanizePostError("instagram", EXPIRED), "Instagram login expired — reconnect in Settings");

const OTHER_190 = `Facebook video upload failed: 400 {"error":{"message":"Malformed access token","type":"OAuthException","code":190}}`;
check("any code 190 is a login problem", humanizePostError("facebook", OTHER_190), "Facebook login expired — reconnect in Settings");

const USER_MSG = `Facebook video upload failed: 400 {"error":{"message":"(#100) Invalid parameter","type":"OAuthException","code":100,` +
  `"error_user_title":"Video too short","error_user_msg":"Your video must be at least 1 second long."}}`;
check("Meta's own message is shown when it gives one", humanizePostError("facebook", USER_MSG), "Facebook: Your video must be at least 1 second long.");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
