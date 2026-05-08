#!/usr/bin/env node
/**
 * Post-build patch: add ffmpeg-static's binary and metadata to the worker
 * route's NFT (Next File Trace) so Vercel ships them inside the lambda.
 *
 * Why we need this: Next 14.2's outputFileTracingIncludes config in
 * next.config.mjs does not reliably take effect for App Router route
 * handlers in this codebase. ffmpeg-static's package.json also doesn't
 * list its binary in `files`, so even when the package itself is
 * traced, the post-install-downloaded binary is skipped.
 *
 * Editing the .nft.json directly is what Vercel's deploy step actually
 * reads, so this guarantees the binary lands in the function bundle.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const ROUTES = [
  "src/app/api/worker/run-scheduled/route", // adjust here if more routes need ffmpeg
];

const FFMPEG_FILES = [
  "node_modules/ffmpeg-static/ffmpeg",
  "node_modules/ffmpeg-static/ffmpeg.exe",
  "node_modules/ffmpeg-static/index.js",
  "node_modules/ffmpeg-static/package.json",
];

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function patchTrace(routeKey) {
  // .next/server/app/api/worker/run-scheduled/route.js.nft.json
  const traceFile = path.join(
    ".next",
    "server",
    routeKey.replace(/^src\//, "") + ".js.nft.json"
  );
  if (!(await fileExists(traceFile))) {
    console.warn(`[patch-ffmpeg-trace] trace file not found: ${traceFile}`);
    return;
  }

  const raw = await fs.readFile(traceFile, "utf8");
  const trace = JSON.parse(raw);
  const before = trace.files.length;

  const traceDir = path.dirname(traceFile);
  const projectRoot = process.cwd();

  for (const f of FFMPEG_FILES) {
    const abs = path.join(projectRoot, f);
    if (!(await fileExists(abs))) continue; // skip platform-specific files that don't exist
    const rel = path.relative(traceDir, abs).split(path.sep).join("/");
    if (!trace.files.includes(rel)) trace.files.push(rel);
  }

  await fs.writeFile(traceFile, JSON.stringify(trace, null, 0));
  console.log(
    `[patch-ffmpeg-trace] ${routeKey}: ${before} → ${trace.files.length} files`
  );
}

(async () => {
  for (const r of ROUTES) await patchTrace(r);
})();
