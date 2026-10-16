import { randomUUID } from "node:crypto";
export class ConfigError extends Error {
  constructor(field: string) {
    super(`Invalid or missing configuration: ${field}`);
    this.name = "ConfigError";
  }
}
export interface Config {
  environment: "development" | "test";
  databaseUrl: string;
  host: string;
  port: number;
  dbTimeoutMs: number;
  poolMax: number;
}
export function config(
  env: NodeJS.ProcessEnv,
  service: "api" | "worker",
): Config {
  if (!["development", "test", "production"].includes(env.NODE_ENV ?? ""))
    throw new ConfigError("NODE_ENV");
  // Production is deliberately unavailable until authentication/deployment security gates exist.
  if (env.NODE_ENV === "production")
    throw new ConfigError("production disabled until DEV02/12 security gates");
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new ConfigError("DATABASE_URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password ||
    url.password === "replace-with-local-value" ||
    url.pathname.length < 2 ||
    url.search
  )
    throw new ConfigError("DATABASE_URL");
  const host = env.HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "::1", "localhost"].includes(host))
    throw new ConfigError("HOST (loopback required before authentication)");
  const number = (key: string, fallback: number, min: number, max: number) => {
    const raw = env[key] ?? String(fallback);
    if (!/^\d+$/.test(raw)) throw new ConfigError(key);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new ConfigError(key);
    return value;
  };
  return {
    environment: env.NODE_ENV as Config["environment"],
    databaseUrl: url.toString(),
    host,
    port: number(
      service === "api" ? "API_PORT" : "WORKER_PORT",
      service === "api" ? 3001 : 3002,
      1,
      65535,
    ),
    dbTimeoutMs: number("DB_TIMEOUT_MS", 1000, 50, 10000),
    poolMax: number("DB_POOL_MAX", 5, 1, 20),
  };
}
export function requestId(input: unknown): string {
  return typeof input === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(input)
    ? input
    : randomUUID();
}
export type LogFields = {
  code?: string;
  requestId?: string;
  correlationId?: string;
  durationMs?: number;
  result?: string;
  phase?: string;
  statusCode?: number;
  rssBytes?: number;
};
export interface Logger {
  info(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}
export function logger(
  service: "api" | "worker" | "migration",
  write: (line: string) => void = (line) => {
    process.stdout.write(line + "\n");
  },
): Logger {
  const emit = (level: string, event: string, fields: LogFields = {}) => {
    const safe: LogFields = {};
    for (const key of [
      "code",
      "requestId",
      "correlationId",
      "durationMs",
      "result",
      "phase",
      "statusCode",
      "rssBytes",
    ] as const) {
      const v = fields[key];
      if (v !== undefined) Object.assign(safe, { [key]: v });
    }
    write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        service,
        event,
        ...safe,
      }),
    );
  };
  return {
    info: (e, f) => emit("info", e, f),
    error: (e, f) => emit("error", e, f),
  };
}
export function installShutdown(
  stop: () => Promise<void>,
  log: Logger,
  timeoutMs = 10000,
): () => void {
  let stopping = false;
  const signal = () => {
    if (stopping) return;
    stopping = true;
    log.info("stopping", { phase: "draining" });
    const deadline = setTimeout(() => {
      log.error("shutdown_timeout", { code: "SHUTDOWN_TIMEOUT" });
      process.exit(1);
    }, timeoutMs);
    deadline.unref();
    void stop()
      .then(() => {
        log.info("stopped", { result: "success" });
        process.exitCode = 0;
      })
      .catch(() => {
        log.error("shutdown_failed", { code: "SHUTDOWN_FAILED" });
        process.exitCode = 1;
      })
      .finally(() => clearTimeout(deadline));
  };
  process.on("SIGTERM", signal);
  process.on("SIGINT", signal);
  return () => {
    process.off("SIGTERM", signal);
    process.off("SIGINT", signal);
  };
}
