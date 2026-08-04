// Run: node scripts/test-ai-clip-staleness.mjs
//
// Covers the predicate that decides whether an ai_clip_jobs row is a dead job
// holding the team's single active-job slot. Getting this wrong in either
// direction is costly: too eager kills a legitimate in-flight upload, too lazy
// leaves AI Clips permanently unusable (which is exactly what happened to job
// 914ac2bd, abandoned 2026-05-10 and still blocking on 2026-08-04).

import {
  ACTIVE_AI_CLIP_STATUSES,
  STALE_ACTIVE_JOB_MS,
  isStaleActiveJob,
} from "../src/lib/aiClipJobStaleness.ts";

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${actual}, want ${expected})`}`);
}

const NOW = new Date("2026-08-04T17:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// --- Terminal states are never reaped, however old -------------------------
for (const status of ["done", "failed"]) {
  check(
    `${status} job from 90 days ago is not stale`,
    isStaleActiveJob({ status, updated_at: ago(90 * 24 * HOUR) }, NOW),
    false
  );
}

// --- Fresh active jobs are never reaped ------------------------------------
for (const status of ACTIVE_AI_CLIP_STATUSES) {
  check(
    `${status} job touched 2 min ago is not stale`,
    isStaleActiveJob({ status, updated_at: ago(2 * MIN) }, NOW),
    false
  );
}

// --- The boundary ----------------------------------------------------------
check(
  "active job just inside the window is not stale",
  isStaleActiveJob({ status: "cutting", updated_at: ago(STALE_ACTIVE_JOB_MS - MIN) }, NOW),
  false
);
check(
  "active job just outside the window is stale",
  isStaleActiveJob({ status: "cutting", updated_at: ago(STALE_ACTIVE_JOB_MS + MIN) }, NOW),
  true
);

// --- A long large-path upload must survive ---------------------------------
// The workflow times out at 30 min, so the window has to clear that comfortably
// while still being long enough for in-browser audio extraction of a big file.
check(
  "window is longer than the 30-minute workflow timeout",
  STALE_ACTIVE_JOB_MS > 30 * MIN,
  true
);
check(
  "large upload heartbeating every 20 min is not stale",
  isStaleActiveJob({ status: "uploading", updated_at: ago(20 * MIN) }, NOW),
  false
);

// --- Falls back to created_at when the row was never updated ---------------
check(
  "never-updated old job is stale via created_at",
  isStaleActiveJob({ status: "pending", updated_at: null, created_at: ago(5 * HOUR) }, NOW),
  true
);
check(
  "never-updated fresh job is not stale via created_at",
  isStaleActiveJob({ status: "pending", updated_at: null, created_at: ago(3 * MIN) }, NOW),
  false
);

// --- Junk timestamps must not silently read as "fresh" ---------------------
check(
  "unparseable timestamps with no fallback are treated as stale",
  isStaleActiveJob({ status: "pending", updated_at: "not-a-date", created_at: null }, NOW),
  true
);

// --- The actual production row that caused this bug ------------------------
check(
  "real orphaned job 914ac2bd is stale",
  isStaleActiveJob(
    { status: "pending", updated_at: "2026-05-10T09:37:00Z", created_at: "2026-05-10T09:37:00Z" },
    NOW
  ),
  true
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
