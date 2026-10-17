// Run: node --test scripts/test-workflow-env-only.mjs
// The repo is public, so workflow_dispatch inputs and run logs are public. A ${{ }} pasted into a
// run: script is substituted before the shell parses it, so a crafted clip title, URL or prompt
// could run shell in a step that holds the service-role key. These tests prove the dispatched
// workflows pass every input, step output and secret through env: instead.
// import-clip.yml gets the same check in test-import-secrets.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = [
  "ai-clips.yml",
  "ai-clip-burn.yml",
  "ai-clips-merge.yml",
  "ai-clips-transcribe-chunk.yml",
  "overlay-burn.yml",
  "process-clip.yml",
];

const indentOf = (line) => line.match(/^ */)[0].length;
const isSkippable = (line) => !line.trim() || line.trim().startsWith("#");
const ENV_LINE = /^\s+[A-Z_][A-Z0-9_]*: \$\{\{ [^{}]+ \}\}\s*$/;
const KEY_LINE = /^\s+[A-Za-z_][A-Za-z0-9_-]*: \$\{\{ [^{}]+ \}\}\s*$/;

/**
 * Returns a message for every ${{ }} outside an env: mapping. The only other places allowed are
 * ones GitHub evaluates itself and never hands to a shell: a job's outputs:, a strategy matrix:
 * and the concurrency group:. Secrets must sit in a step's env, not the job's.
 */
function findViolations(yml) {
  const lines = yml.split(/\r?\n/);
  const violations = [];
  for (const [i, line] of lines.entries()) {
    if (isSkippable(line) || !line.includes("${{")) continue;
    // Parent = nearest earlier line with less indentation (for a run: | body, that's the run: key)
    let parent = "";
    let parentIndent = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (isSkippable(lines[j])) continue;
      if (indentOf(lines[j]) < indentOf(line)) {
        parent = lines[j].trim().replace(/^- /, "");
        parentIndent = indentOf(lines[j]);
        break;
      }
    }
    const where = `line ${i + 1}: ${line.trim()}`;
    if (parent === "env:") {
      if (!ENV_LINE.test(line)) violations.push(`env entry is not NAME: \${{ expr }} (${where})`);
      else if (line.includes("secrets.") && parentIndent < 8) violations.push(`secret in job-level env (${where})`);
    } else if (parent === "outputs:" || parent === "matrix:") {
      if (!KEY_LINE.test(line)) violations.push(`${parent} entry is not key: \${{ expr }} (${where})`);
    } else if (parent === "concurrency:" && /^\s+group: /.test(line)) {
      // evaluated by GitHub, never by a shell
    } else {
      violations.push(`expression outside env: (${where})`);
    }
  }
  return violations;
}

for (const name of WORKFLOWS) {
  test(`${name} uses \${{ }} only in env:`, () => {
    const yml = fs.readFileSync(path.join(root, ".github/workflows", name), "utf8");
    assert.deepEqual(findViolations(yml), []);
  });
}

test("the checker catches expressions pasted into scripts, if: and job-level secrets", () => {
  const bad = [
    "jobs:",
    "  burn:",
    "    env:",
    "      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}",
    "      TITLE: \"${{ inputs.clip_title }}\"",
    "    steps:",
    "      - name: Detect",
    "        if: ${{ inputs.mode == 'portrait_auto' }}",
    "        run: |",
    "          echo \"${{ inputs.clip_title }}\"",
    "      - name: Python",
    "        run: |",
    "          python3 - <<'PYEOF'",
    "          job_id = \"${{ inputs.job_id }}\"",
    "          PYEOF",
    "      - uses: some/action@v1",
    "        with:",
    "          token: ${{ secrets.PAT }}",
  ].join("\n");
  const found = findViolations(bad);
  assert.equal(found.length, 6, found.join("\n"));
  assert.match(found[0], /secret in job-level env/);
  assert.match(found[1], /env entry is not NAME/);
});

test("the checker accepts env, job outputs, matrix and the concurrency group", () => {
  const good = [
    "jobs:",
    "  build:",
    "    outputs:",
    "      indices: ${{ steps.gen.outputs.indices }}",
    "    concurrency:",
    "      group: team-${{ inputs.team_id }}",
    "    strategy:",
    "      matrix:",
    "        chunk_index: ${{ fromJSON(needs.build.outputs.indices) }}",
    "    env:",
    "      JOB_ID: ${{ inputs.job_id }}",
    "    steps:",
    "      # a comment may mention ${{ }}",
    "      - name: Call",
    "        env:",
    "          GH_TOKEN: ${{ secrets.WORKFLOW_DISPATCH_PAT || secrets.GITHUB_TOKEN }}",
    "        run: |",
    "          curl -H \"Authorization: Bearer ${GH_TOKEN}\" -d \"$(jq -nc --arg id \"$JOB_ID\" '{id:$id}')\"",
  ].join("\n");
  assert.deepEqual(findViolations(good), []);
});

test("values written to GITHUB_ENV / GITHUB_OUTPUT from inputs are stripped of newlines", () => {
  // A newline in a value written to GITHUB_ENV would add another variable (BASH_ENV, LD_PRELOAD...)
  // to every later step.
  for (const name of WORKFLOWS) {
    const lines = fs.readFileSync(path.join(root, ".github/workflows", name), "utf8").split(/\r?\n/);
    for (const [i, line] of lines.entries()) {
      const m = line.match(/echo "([A-Za-z_]+)=\$\{?([A-Z_]+)\}?" >> "?\$GITHUB_(ENV|OUTPUT)"?/);
      if (!m) continue;
      const assigned = lines.slice(0, i).reverse().find((l) => new RegExp(`^\\s*${m[2]}=`).test(l));
      assert.ok(assigned, `${name} line ${i + 1}: ${m[2]} is never assigned in this step`);
      const safe = /tr -d '\\r\\n'|tr -cd '0-9'|stat -c%s|json\.dumps/.test(assigned);
      assert.ok(safe, `${name} line ${i + 1}: ${m[2]} reaches GITHUB_${m[3]} without stripping newlines`);
    }
  }
});
