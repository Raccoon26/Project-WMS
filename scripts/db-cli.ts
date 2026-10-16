import { config, logger, ConfigError } from "@wms/runtime";
import { createDatabase, testDatabaseUrl } from "@wms/db";
const log = logger("migration");
let db: ReturnType<typeof createDatabase> | undefined;
try {
  const test = process.argv.includes("--test");
  const url = test
    ? testDatabaseUrl(process.env.TEST_DATABASE_URL)
    : config(process.env, "api").databaseUrl;
  db = createDatabase(url, { timeoutMs: 10000, max: 1 });
  await db.migrate();
  if (!(await db.migrationStatus()))
    throw new Error("MIGRATION_STATUS_INVALID");
  log.info("migration_complete", { result: "success" });
} catch (error) {
  log.error("migration_failed", {
    code: error instanceof ConfigError ? "CONFIG_INVALID" : "MIGRATION_FAILED",
  });
  if (error instanceof ConfigError) process.stderr.write(error.message + "\n");
  process.exitCode = 1;
} finally {
  await db?.close();
}
