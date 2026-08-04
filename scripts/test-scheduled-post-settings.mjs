// Run: node --experimental-strip-types scripts/test-scheduled-post-settings.mjs
//
// The create route used to hand-roll one `if` per platform and had drifted: the
// worker read 8 settings types while the route persisted 5, so pinterest_settings,
// bluesky_settings and x_settings were silently dropped. Pinterest failed loudly
// ("No Pinterest board selected") because board_id is required; Bluesky and X just
// quietly ignored the user's overrides.
//
// The column list is an explicit allowlist rather than `${provider}_settings`
// because scheduled_posts has no snapchat_settings column — deriving the name
// would turn a silent drop into a failed insert.

import {
  PLATFORM_SETTINGS_COLUMNS,
  resolvePlatformSettings,
} from "../src/lib/scheduledPostSettings.ts";

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}

// --- The three that were being dropped ------------------------------------
check(
  "pinterest board is persisted",
  resolvePlatformSettings("pinterest", { pinterest_settings: { board_id: "abc123" } }),
  { column: "pinterest_settings", value: { board_id: "abc123" } }
);
check(
  "x settings are persisted",
  resolvePlatformSettings("x", { x_settings: { reply_settings: "following" } }),
  { column: "x_settings", value: { reply_settings: "following" } }
);
check(
  "bluesky settings are persisted",
  resolvePlatformSettings("bluesky", { bluesky_settings: { title_override: "hi" } }),
  { column: "bluesky_settings", value: { title_override: "hi" } }
);

// --- The five that already worked must keep working -----------------------
for (const p of ["tiktok", "facebook", "instagram", "youtube", "linkedin"]) {
  check(
    `${p} settings still persisted`,
    resolvePlatformSettings(p, { [`${p}_settings`]: { a: 1 } }),
    { column: `${p}_settings`, value: { a: 1 } }
  );
}

// --- Provider casing must not silently drop settings ----------------------
check(
  "provider casing is normalised",
  resolvePlatformSettings("YouTube", { youtube_settings: { privacy: "public" } }),
  { column: "youtube_settings", value: { privacy: "public" } }
);
check(
  "provider whitespace is tolerated",
  resolvePlatformSettings(" pinterest ", { pinterest_settings: { board_id: "b" } }),
  { column: "pinterest_settings", value: { board_id: "b" } }
);

// --- Platforms with no column must never be written -----------------------
// scheduled_posts has no snapchat_settings; writing it would fail the insert.
check(
  "snapchat is not written even when sent",
  resolvePlatformSettings("snapchat", { snapchat_settings: { post_type: "spotlight" } }),
  null
);
check(
  "snapchat has no column mapping",
  PLATFORM_SETTINGS_COLUMNS.snapchat ?? null,
  null
);
check(
  "unknown provider is ignored",
  resolvePlatformSettings("myspace", { myspace_settings: { x: 1 } }),
  null
);

// --- Absent / mismatched settings -----------------------------------------
check("no settings sent yields null", resolvePlatformSettings("pinterest", {}), null);
check(
  "null settings yields null",
  resolvePlatformSettings("pinterest", { pinterest_settings: null }),
  null
);
check(
  "settings for a different provider are not cross-written",
  resolvePlatformSettings("youtube", { tiktok_settings: { a: 1 } }),
  null
);
check("missing provider yields null", resolvePlatformSettings(undefined, { youtube_settings: { a: 1 } }), null);

// --- Every mapped column must be one the worker actually reads ------------
check(
  "mapping covers exactly the supported platforms",
  Object.keys(PLATFORM_SETTINGS_COLUMNS).sort(),
  ["bluesky", "facebook", "instagram", "linkedin", "pinterest", "tiktok", "x", "youtube"]
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
