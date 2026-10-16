import { config, logger, installShutdown, ConfigError } from "@wms/runtime";
import { createDatabase } from "@wms/db";
import { createWorker } from "./worker.js";
const log = logger("worker");
async function main() {
  const c = config(process.env, "worker");
  const db = createDatabase(c.databaseUrl, {
    timeoutMs: c.dbTimeoutMs,
    max: c.poolMax,
  });
  const worker = createWorker(db, log, { host: c.host, port: c.port });
  installShutdown(() => worker.stop(), log);
  await worker.start();
}
void main().catch((error) => {
  log.error("startup_failed", {
    code:
      error instanceof ConfigError ? "CONFIG_INVALID" : "WORKER_STARTUP_FAILED",
  });
  if (error instanceof ConfigError) process.stderr.write(error.message + "\n");
  process.exitCode = 1;
});
