import { authOptions } from "./auth/routes.js";
import { createDatabase } from "@wms/db";
import { config, logger, installShutdown, ConfigError } from "@wms/runtime";
import { buildApi } from "./app.js";
const log = logger("api");
async function main() {
  const c = config(process.env, "api");
  const db = createDatabase(c.databaseUrl, {
    timeoutMs: c.dbTimeoutMs,
    max: c.poolMax,
    ...(process.env.NODE_ENV === "test" && process.env.DB_SCHEMA
      ? { schema: process.env.DB_SCHEMA }
      : {}),
  });
  const app = buildApi(db, log, authOptions(db.pool, process.env));
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
