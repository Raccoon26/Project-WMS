import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
const suite = process.argv[2];
if (!["unit", "integration", "fault", "invariants"].includes(suite))
  throw new Error("Unknown suite");
mkdirSync("test-results", { recursive: true });
const output = `test-results/${suite}.json`;
if (existsSync(output)) unlinkSync(output);
const result = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    suite === "invariants" ? "tests/integration/inventory" : `tests/${suite}`,
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${output}`,
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const report = JSON.parse(readFileSync(output, "utf8"));
if (
  !report.numTotalTests ||
  report.numPassedTests !== report.numTotalTests ||
  report.numPendingTests ||
  report.numTodoTests ||
  report.numFailedTests
)
  throw new Error("Zero/skipped/failed tests are not a successful suite");
console.log(
  `Verified ${suite}: ${report.numPassedTests} passed; 0 failed/skipped`,
);
