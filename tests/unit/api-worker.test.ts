import { it, expect } from "vitest";
import { buildApi } from "../../apps/api/src/app";
import { createWorker } from "../../apps/worker/src/worker";
import { logger } from "@wms/runtime";
const log = logger("api", () => {});
it("API error/request-id and input validation are standardized", async () => {
  const app = buildApi({ check: async () => true, close: async () => {} }, log);
  app.get("/test-internal", () => {
    throw new Error("synthetic-" + "private-failure");
  });
  try {
    const live = await app.inject({
      url: "/api/v1/health/live",
      headers: { "x-request-id": "request-123" },
    });
    expect(live.statusCode).toBe(200);
    expect(live.headers["x-request-id"]).toBe("request-123");
    const bad = await app.inject("/api/v1/health/live?unexpected=1");
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe("INVALID_INPUT");
    const internal = await app.inject("/test-internal");
    expect(internal.statusCode).toBe(500);
    expect(internal.json()).toMatchObject({
      code: "INTERNAL_ERROR",
      details: null,
      retryable: false,
    });
    expect(internal.body).not.toMatch(/stack|private-failure|Error:/);
  } finally {
    await app.close();
  }
});
it("no unauthenticated business or configuration writes exist", async () => {
  const app = buildApi({ check: async () => true, close: async () => {} }, log);
  try {
    for (const url of [
      "/api/v1/outbounds",
      "/api/v1/inventory",
      "/api/v1/payments",
      "/api/v1/settings",
      "/api/v1/version",
    ]) {
      const r = await app.inject({ method: "POST", url });
      expect(r.statusCode).toBe(404);
      expect(r.json().code).toBe("NOT_FOUND");
    }
  } finally {
    await app.close();
  }
});
it("unknown DB exceptions are sanitized and liveness is independent", async () => {
  const lines: string[] = [];
  const app = buildApi(
    {
      check: async () => {
        throw new Error("synthetic-" + "db-sensitive");
      },
      close: async () => {},
    },
    logger("api", (s) => lines.push(s)),
  );
  try {
    const r = await app.inject("/api/v1/health/ready");
    expect(r.statusCode).toBe(503);
    expect((await app.inject("/api/v1/health/live")).statusCode).toBe(200);
    expect(r.body + lines.join("")).not.toContain("db-sensitive");
  } finally {
    await app.close();
  }
});
it("worker rejects startup failure and releases the DB", async () => {
  let closed = 0;
  const w = createWorker(
    {
      check: async () => false,
      close: async () => {
        closed++;
      },
    },
    log,
    { host: "127.0.0.1", port: 0 },
  );
  await expect(w.start()).rejects.toThrow("WORKER_STARTUP_FAILED");
  expect(closed).toBe(1);
});
it("worker shutdown exceptions surface and HTTP resources still close", async () => {
  const w = createWorker(
    {
      check: async () => true,
      close: async () => {
        throw new Error("synthetic close failure");
      },
    },
    log,
    { host: "127.0.0.1", port: 0, intervalMs: 100 },
  );
  await w.start();
  await expect(w.stop()).rejects.toThrow("synthetic close failure");
  expect(w.address).toBeNull();
});
it("worker start/stop is idempotent for concurrent stop requests", async () => {
  let closed = 0;
  const w = createWorker(
    {
      check: async () => true,
      close: async () => {
        closed++;
      },
    },
    log,
    { host: "127.0.0.1", port: 0 },
  );
  await w.start();
  await Promise.all([w.stop(), w.stop()]);
  expect(closed).toBe(1);
});
it("worker stopped during startup never opens a status socket", async () => {
  let resolve!: (value: boolean) => void;
  let closed = 0;
  const w = createWorker(
    {
      check: () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
      close: async () => {
        closed++;
      },
    },
    log,
    { host: "127.0.0.1", port: 0 },
  );
  const starting = w.start();
  const stopping = w.stop();
  resolve(true);
  await starting;
  await stopping;
  expect(w.address).toBeNull();
  expect(closed).toBe(1);
});
it("oversized and unsupported content preserve HTTP status without leaking payload", async () => {
  const app = buildApi({ check: async () => true, close: async () => {} }, log);
  app.post("/test-input", async () => ({ ok: true }));
  try {
    const large = await app.inject({
      method: "POST",
      url: "/test-input",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ input: "x".repeat(20000) }),
    });
    expect(large.statusCode).toBe(413);
    expect(large.json().code).toBe("INVALID_INPUT");
    const unsupported = await app.inject({
      method: "POST",
      url: "/test-input",
      headers: { "content-type": "application/octet-stream" },
      payload: "synthetic",
    });
    expect(unsupported.statusCode).toBe(415);
    expect(unsupported.json().code).toBe("INVALID_INPUT");
  } finally {
    await app.close();
  }
});
