import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { inventoryFixture } from "../inventory-helper";
import { child, freePort, testUrl, until } from "../helpers";
it("L14 L29 real API SIGTERM/restart/SIGINT retains one posted command and synthetic stock", async () => {
  const f = await inventoryFixture();
  let running: ReturnType<typeof child> | undefined;
  try {
    const port = await freePort(),
      env = {
        NODE_ENV: "test",
        DATABASE_URL: testUrl(),
        DB_SCHEMA: f.schema,
        API_PORT: String(port),
        AUTH_ENCRYPTION_KEY: f.key.toString("base64"),
        AUTH_ORIGIN: f.origin,
        DB_TIMEOUT_MS: "2000",
      };
    const body = {
        ...f.evidence(),
        sku_id: f.sku.id,
        sku_version: 1,
        warehouse_id: f.warehouse.id,
        quantity: "9007199254740993",
      },
      key = randomUUID();
    const post = () =>
      fetch("http://127.0.0.1:" + port + "/api/v1/inventory/openings", {
        method: "POST",
        headers: {
          cookie: f.cookie,
          origin: f.origin,
          "x-csrf-token": f.csrf,
          "idempotency-key": key,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    running = child("apps/api/src/main.ts", env);
    await running.started();
    const first = await post();
    expect(first.status).toBe(200);
    const result = await first.json();
    expect((await running.stop("SIGTERM")).code).toBe(0);
    running = child("apps/api/src/main.ts", env);
    await running.started();
    const second = await post();
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(result);
    expect(
      (await f.db.pool.query("SELECT count(*) FROM inventory_transactions"))
        .rows[0].count,
    ).toBe("1");
    await f.invariant();
    expect((await running.stop("SIGINT")).code).toBe(0);
    expect(running.output).not.toContain(f.key.toString("base64"));
    expect(running.output).not.toContain(f.cookie);
  } finally {
    running?.dispose();
    await f.cleanup();
  }
}, 30000);
it("F12 L15 verified test PostgreSQL stop/start cannot authorize inventory and recovers preserved ledger", async () => {
  const id = process.env.WMS_TEST_CONTAINER;
  if (!id || !/^[a-f0-9]{12,64}$/.test(id))
    throw new Error("TEST_CONTAINER_REQUIRED");
  const info = JSON.parse(
    execFileSync("docker", ["inspect", id], { encoding: "utf8" }),
  )[0];
  if (
    !info.Config.Env.includes("POSTGRES_DB=wms_test") ||
    !info.Config.Env.includes("POSTGRES_USER=wms_test") ||
    !info.NetworkSettings.Ports["5432/tcp"]?.some(
      (p: { HostPort: string }) => p.HostPort === new URL(testUrl()).port,
    )
  )
    throw new Error("UNSAFE_TEST_CONTAINER");
  const f = await inventoryFixture();
  let stopped = false;
  try {
    await f.opening();
    execFileSync("docker", ["stop", "-t", "2", id], { stdio: "ignore" });
    stopped = true;
    const r = await f.request("inventory");
    expect(r.statusCode).toBe(503);
    execFileSync("docker", ["start", id], { stdio: "ignore" });
    stopped = false;
    await until(() => f.db.check());
    await f.invariant();
    expect((await f.request("inventory")).json().items[0].quantity).toBe("100");
  } finally {
    if (stopped) execFileSync("docker", ["start", id], { stdio: "ignore" });
    await f.cleanup();
  }
}, 30000);
