import { createDatabase } from "@wms/db";
import { config, logger, installShutdown, ConfigError } from "@wms/runtime";
import { buildApi } from "./app.js";
const log = logger("api");
async function main() {
  const c = config(process.env, "api");
  const db = createDatabase(c.databaseUrl, {
    timeoutMs: c.dbTimeoutMs,
    max: c.poolMax,
  });
  const app = buildApi(db, log);
  installShutdown(async () => {
    try {
      await app.close();
    } finally {
      await db.close();
    }
  }, log);
  try {
    await app.listen({ host: c.host, port: c.port });
    log.info("started", {
      phase: "listening",
      rssBytes: process.memoryUsage().rss,
    });
  } catch {
    await db.close();
    throw new Error("STARTUP_FAILED");
  }
}
void main().catch((error) => {
  log.error("startup_failed", {
    code: error instanceof ConfigError ? "CONFIG_INVALID" : "STARTUP_FAILED",
  });
  if (error instanceof ConfigError) process.stderr.write(error.message + "\n");
  process.exitCode = 1;
});
