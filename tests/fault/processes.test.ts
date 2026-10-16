import { it, expect } from "vitest";
import { child, freePort, testUrl, until, scopedDatabase } from "../helpers";
import { createDatabase } from "@wms/db";
import { execFileSync } from "node:child_process";
import { buildApi } from "../../apps/api/src/app";
import { logger } from "@wms/runtime";
it.each(["SIGTERM", "SIGINT"] as const)(
  "worker handles %s, releases resources and safely restarts",
  async (signal) => {
    const url = testUrl();
    const db = createDatabase(url);
    await db.migrate();
    await db.close();
    const port = await freePort();
    const env = {
      NODE_ENV: "test",
      DATABASE_URL: url,
      WORKER_PORT: String(port),
      DB_TIMEOUT_MS: "300",
    };
    const a = child("apps/worker/src/main.ts", env);
    try {
      await a.started();
      expect(
        (await fetch(`http://127.0.0.1:${port}/health/ready`)).status,
      ).toBe(200);
      expect(await a.stop(signal)).toEqual({ code: 0, signal: null });
      expect(a.output).toContain('"event":"stopped"');
      const b = child("apps/worker/src/main.ts", env);
      try {
        await b.started();
        expect(await b.stop()).toEqual({ code: 0, signal: null });
      } finally {
        b.dispose();
      }
    } finally {
      a.dispose();
    }
  },
  30000,
);
it("worker startup DB failure exits nonzero without exposing connection secret", async () => {
  const sensitive = "synthetic-" + "private-marker";
  const p = child("apps/worker/src/main.ts", {
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://wms_test:${sensitive}@127.0.0.1:1/wms_test`,
    DB_TIMEOUT_MS: "100",
  });
  try {
    expect((await p.exit).code).toBe(1);
    expect(p.output).toContain("WORKER_STARTUP_FAILED");
    expect(p.output).not.toContain(sensitive);
  } finally {
    p.dispose();
  }
});
it.each(["SIGTERM", "SIGINT"] as const)(
  "API responds to HTTP with DB down and handles %s",
  async (signal) => {
    const port = await freePort();
    const p = child("apps/api/src/main.ts", {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://wms_test:synthetic@127.0.0.1:1/wms_test",
      API_PORT: String(port),
      DB_TIMEOUT_MS: "100",
    });
    try {
      await p.started();
      expect(
        (await fetch(`http://127.0.0.1:${port}/api/v1/health/live`)).status,
      ).toBe(200);
      expect(
        (await fetch(`http://127.0.0.1:${port}/api/v1/health/ready`)).status,
      ).toBe(503);
      expect((await p.stop(signal)).code).toBe(0);
    } finally {
      p.dispose();
    }
  },
);
it("production process without security prerequisites fails closed", async () => {
  const p = child("apps/api/src/main.ts", {
    NODE_ENV: "production",
    DATABASE_URL: testUrl(),
  });
  try {
    expect((await p.exit).code).toBe(1);
    expect(p.output).toContain("CONFIG_INVALID");
    expect(p.output).not.toContain(testUrl());
  } finally {
    p.dispose();
  }
});
it("real PostgreSQL stop/start degrades readiness then recovers with data preserved", async () => {
  const scope = await scopedDatabase(300);
  await scope.db.migrate();
  await scope.db.pool.query(
    "INSERT INTO foundation_metadata(key,value) VALUES ('restart','preserved')",
  );
  const app = buildApi(
    scope.db,
    logger("api", () => {}),
  );
  const id = process.env.WMS_TEST_CONTAINER;
  if (!id || !/^([a-f0-9]{12,64})$/.test(id))
    throw new Error(
      "WMS_TEST_CONTAINER must identify the isolated Docker test database",
    );
  const inspect = JSON.parse(
    execFileSync("docker", ["inspect", id], { encoding: "utf8" }),
  )[0];
  const vars = inspect.Config.Env as string[];
  const port = inspect.NetworkSettings.Ports["5432/tcp"] as {
    HostPort: string;
    HostIp: string;
  }[];
  if (
    !vars.includes("POSTGRES_DB=wms_test") ||
    !vars.includes("POSTGRES_USER=wms_test") ||
    !port.some((p) => p.HostPort === (new URL(testUrl()).port || "5432"))
  )
    throw new Error("REFUSE_UNVERIFIED_TEST_CONTAINER");
  const workerPort = await freePort();
  const worker = child("apps/worker/src/main.ts", {
    NODE_ENV: "test",
    DATABASE_URL: testUrl(),
    WORKER_PORT: String(workerPort),
    DB_TIMEOUT_MS: "300",
  });
  try {
    await worker.started();
    execFileSync("docker", ["stop", "-t", "2", id], { stdio: "ignore" });
    expect(
      (await fetch(`http://127.0.0.1:${workerPort}/health/ready`)).status,
    ).toBe(503);
    expect(
      (await fetch(`http://127.0.0.1:${workerPort}/health/live`)).status,
    ).toBe(200);
    expect((await app.inject("/api/v1/health/ready")).statusCode).toBe(503);
    expect((await app.inject("/api/v1/health/live")).statusCode).toBe(200);
    execFileSync("docker", ["start", id], { stdio: "ignore" });
    await until(() => scope.db.check());
    expect(
      (await fetch(`http://127.0.0.1:${workerPort}/health/ready`)).status,
    ).toBe(200);
    expect((await app.inject("/api/v1/health/ready")).statusCode).toBe(200);
    expect(
      (
        await scope.db.pool.query(
          "SELECT value FROM foundation_metadata WHERE key='restart'",
        )
      ).rows[0].value,
    ).toBe("preserved");
  } finally {
    execFileSync("docker", ["start", id], { stdio: "ignore" });
    await until(() => scope.db.check());
    try {
      await worker.stop();
    } finally {
      worker.dispose();
      await app.close();
      await scope.cleanup();
    }
  }
}, 40000);
it("shutdown exception exits nonzero and redacts internal details", async () => {
  const p = child("tests/fault/fixtures/shutdown-error.ts", {});
  try {
    await p.started();
    expect((await p.stop()).code).toBe(1);
    expect(p.output).toContain("SHUTDOWN_FAILED");
    expect(p.output).not.toContain("private-shutdown-detail");
  } finally {
    p.dispose();
  }
});
