import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
const enabled = existsSync("apps/api/src/auth/service.ts");
const env = { ...process.env, NODE_ENV: "test" };
function run(args) {
  const r = spawnSync("pnpm", args, {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) throw new Error("BROWSER_COMMAND_FAILED");
}
mkdirSync("test-results", { recursive: true });
const output = "test-results/e2e.json";
if (existsSync(output)) unlinkSync(output);
try {
  if (enabled) {
    run([
      "exec",
      "tsx",
      "--conditions=source",
      "scripts/auth-test-seed.ts",
      "--prepare",
    ]);
    const state = JSON.parse(
      readFileSync(".runtime/auth-fixture.json", "utf8"),
    );
    env.AUTH_ENCRYPTION_KEY = state.key;
    env.AUTH_ORIGIN = "http://127.0.0.1:4173";
    env.DB_SCHEMA = state.schema;
    writeFileSync(
      ".runtime/auth-playwright.config.ts",
      `import original from '../playwright.config';\nexport default {...original,testDir:'../tests/e2e',webServer: original.webServer.map((server,index)=> index === 0 ? {...server,env:{...server.env,AUTH_ENCRYPTION_KEY:process.env.AUTH_ENCRYPTION_KEY!,AUTH_ORIGIN:process.env.AUTH_ORIGIN!,DB_SCHEMA:process.env.DB_SCHEMA!}}:server)};\n`,
    );
  }
  run([
    "exec",
    "playwright",
    "test",
    ...(enabled ? ["--config", ".runtime/auth-playwright.config.ts"] : []),
  ]);
  const { stats } = JSON.parse(readFileSync(output, "utf8"));
  if (!stats.expected || stats.skipped || stats.unexpected || stats.flaky)
    throw new Error("Zero/skipped/failed/flaky browser tests are not success");
  console.log(`Verified browser: ${stats.expected} passed; 0 failed/skipped`);
} finally {
  if (enabled && existsSync(".runtime/auth-fixture.json"))
    run([
      "exec",
      "tsx",
      "--conditions=source",
      "scripts/auth-test-seed.ts",
      "--cleanup",
    ]);
}
