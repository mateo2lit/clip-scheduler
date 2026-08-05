// Run: node scripts/test-preview-coverage.mjs
//
// Guards a gap that is invisible until someone selects the platform: Pinterest was
// selectable on the uploads page but had no case in PostPreviewPanel, so the tab
// rendered with no icon, the raw key "pinterest" as its label, and a blank body.
//
// This is a source-consistency check rather than a unit test — the bug lives in the
// gap between two files, so that is where it has to be caught.

import fs from "node:fs";

const UPLOADS = "src/app/uploads/page.tsx";
const PANEL = "src/app/uploads/PostPreviewPanel.tsx";

const uploads = fs.readFileSync(UPLOADS, "utf8");
const panel = fs.readFileSync(PANEL, "utf8");

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : `\n        ${detail}`}`);
}

// Platforms a user can actually pick on the uploads page.
const platformsBlock = uploads.match(/const PLATFORMS[^\n]*=\s*\[(.*?)\n\];/s);
const selectable = platformsBlock
  ? [...platformsBlock[1].matchAll(/key:\s*"([a-z0-9]+)"/g)].map((m) => m[1])
  : [];

check("found the selectable platform list", selectable.length > 0, `parsed: ${selectable}`);

// What the preview panel knows about.
const labelsBlock = panel.match(/PLATFORM_LABELS[^=]*=\s*\{(.*?)\};/s);
const labelled = labelsBlock ? [...labelsBlock[1].matchAll(/(\w+):/g)].map((m) => m[1]) : [];

const rendered = [...panel.matchAll(/activePlatform === "([a-z0-9]+)"/g)].map((m) => m[1]);
const iconed = [...panel.matchAll(/platform === "([a-z0-9]+)"/g)].map((m) => m[1]);

console.log(`\n  selectable: ${selectable.join(", ")}\n`);

for (const p of selectable) {
  check(`${p} has a preview label`, labelled.includes(p), `PLATFORM_LABELS is missing "${p}" — the tab would show the raw key`);
  check(`${p} has a preview component`, rendered.includes(p), `no \`activePlatform === "${p}"\` branch — the preview body would be blank`);
  check(`${p} has a tab icon`, iconed.includes(p), `PlatformIcon returns null for "${p}"`);
}

// The reverse direction is only a tidiness issue, but a preview for a platform that
// can no longer be selected is dead code worth noticing.
for (const p of rendered) {
  check(`${p} preview corresponds to a selectable platform`, selectable.includes(p),
    `PostPreviewPanel renders "${p}" but the uploads page cannot select it`);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
