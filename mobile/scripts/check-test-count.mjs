// =====================================================================
// check-test-count.mjs — fail when the suite loses tests.
//
// Why: the mobile suite is largely source-pin tests (remoteChrome,
// feedbackSurface, pageToggle, adminDeviceGrouping, …). They are the only
// thing standing between a refactor and the old behaviour coming back, and
// they can disappear silently — a deleted pin file, a `.skip`, or a test file
// that stops being collected all leave `npm test` green with fewer assertions.
// The per-file assertions cannot see that; this can.
//
// It runs vitest itself with the JSON reporter (so the number comes from
// vitest's own collection, not from a grep) and compares against
// test-count.baseline.json.
//
//   node scripts/check-test-count.mjs            # check
//   node scripts/check-test-count.mjs --update   # re-baseline (deliberate)
//
// A DROP fails. Growth is fine and does NOT need a baseline update — adding
// tests should never require touching this file, otherwise it becomes noise.
// =====================================================================
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(rootDir, "test-count.baseline.json");
const update = process.argv.includes("--update");

const outDir = mkdtempSync(join(tmpdir(), "genum-vitest-"));
const outFile = join(outDir, "results.json");

function runVitest() {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    npx,
    ["vitest", "run", "--reporter=json", `--outputFile=${outFile}`],
    { cwd: rootDir, encoding: "utf8", shell: process.platform === "win32" },
  );
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    console.error("\ncheck-test-count: vitest itself failed — fix the suite first.");
    process.exit(result.status ?? 1);
  }
}

runVitest();

let report;
try {
  report = JSON.parse(readFileSync(outFile, "utf8"));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

const tests = Number(report.numTotalTests ?? 0);
const files = Array.isArray(report.testResults) ? report.testResults.length : 0;
if (!tests || !files) {
  console.error(
    `check-test-count: vitest reported ${tests} tests in ${files} test files — refusing to record a zero baseline.`,
  );
  process.exit(1);
}

const current = { tests, files };

if (update) {
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n", "utf8");
  console.log(`check-test-count: baseline set to ${tests} tests in ${files} files.`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error(
    "check-test-count: no baseline. Run `node scripts/check-test-count.mjs --update` once and commit the file.",
  );
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const baseTests = Number(baseline.tests ?? 0);
const baseFiles = Number(baseline.files ?? 0);

console.log(
  `check-test-count: ${tests} tests in ${files} files (baseline ${baseTests} in ${baseFiles}).`,
);

const lostFiles = baseFiles - files;
const lostTests = baseTests - tests;
if (lostFiles > 0 || lostTests > 0) {
  console.error(
    `\ncheck-test-count: the suite SHRANK — ${lostTests} test(s) and ${lostFiles} file(s) below the baseline.`,
  );
  console.error(
    "A deleted suite, a stray .skip/.only or a file that stopped being collected is invisible to the assertions it removed.",
  );
  console.error(
    "Restore the tests. If the removal is genuinely intended, re-baseline deliberately with `--update` and say why in the commit message.",
  );
  process.exit(1);
}

if (tests > baseTests || files > baseFiles) {
  console.log(
    "check-test-count: grew since the baseline — that is fine; re-baseline only if you want the number pinned higher.",
  );
}
