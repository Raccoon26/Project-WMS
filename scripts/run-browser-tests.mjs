import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync, readFileSync, mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
const output = "test-results/e2e.json";
if (existsSync(output)) unlinkSync(output);
const result = spawnSync("pnpm", ["exec", "playwright", "test"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.status !== 0) process.exit(result.status ?? 1);
const { stats } = JSON.parse(readFileSync(output, "utf8"));
if (!stats.expected || stats.skipped || stats.unexpected || stats.flaky)
  throw new Error("Zero/skipped/failed/flaky browser tests are not success");
console.log(`Verified browser: ${stats.expected} passed; 0 failed/skipped`);
