import { createServer } from "node:http";
import { apiError, utcNow } from "@wms/contracts";
import type { DatabaseProbe } from "@wms/contracts";
import type { Logger } from "@wms/runtime";
import { requestId } from "@wms/runtime";
// Read-only database probe loop. No outbound tasks or provider calls are registered.
export function createWorker(
  db: DatabaseProbe,
  log: Logger,
  options: { host: string; port: number; intervalMs?: number },
) {
  let stopping = false;
  let ready = false;
  let timer: NodeJS.Timeout | undefined;
  let inflight: Promise<void> | undefined;
  let startPromise: Promise<void> | undefined;
  let stopPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  const closeDB = () => (closePromise ??= db.close());
  const probe = async () => {
    ready = await db.check().catch(() => false);
    log.info("database_probe", {
      code: ready ? "DB_READY" : "DB_UNAVAILABLE",
      result: ready ? "success" : "failure",
    });
  };
  const schedule = () => {
    if (!stopping)
      timer = setTimeout(() => {
        inflight = probe().finally(schedule);
      }, options.intervalMs ?? 30000);
  };
  const server = createServer(async (req, res) => {
    const id = requestId(req.headers["x-request-id"]);
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-request-id", id);
    if (
      req.method !== "GET" ||
      !["/health/live", "/health/ready"].includes(req.url ?? "")
    ) {
      res.statusCode = 404;
      res.end(JSON.stringify(apiError("NOT_FOUND", id)));
      return;
    }
    if (req.url === "/health/ready" && !stopping)
      ready = await db.check().catch(() => false);
    if (req.url === "/health/ready" && (!ready || stopping)) {
      res.statusCode = 503;
      res.end(JSON.stringify(apiError("SERVICE_UNAVAILABLE", id)));
      return;
    }
    res.end(
      JSON.stringify({ status: "ok", service: "worker", checkedAt: utcNow() }),
    );
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 20;
  return {
    start() {
      startPromise ??= (async () => {
        try {
          inflight = probe();
          await inflight;
          if (stopping) return;
          if (!ready) throw new Error("DB_UNAVAILABLE");
          await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(options.port, options.host, () => {
              server.off("error", reject);
              resolve();
            });
          });
          if (!stopping) {
            log.info("started", {
              phase: "idle_readonly",
              rssBytes: process.memoryUsage().rss,
            });
            schedule();
          }
        } catch {
          await closeDB();
          throw new Error("WORKER_STARTUP_FAILED");
        }
      })();
      return startPromise;
    },
    stop() {
      stopPromise ??= (async () => {
        stopping = true;
        ready = false;
        if (timer) clearTimeout(timer);
        try {
          await startPromise?.catch(() => {});
          await inflight;
          await new Promise<void>((resolve, reject) => {
            if (!server.listening) {
              resolve();
              return;
            }
            server.close((e) => (e ? reject(e) : resolve()));
            server.closeIdleConnections();
          });
        } finally {
          await closeDB();
        }
      })();
      return stopPromise;
    },
    get address() {
      return server.address();
    },
  };
}
