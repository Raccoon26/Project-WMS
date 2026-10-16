import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { catalogFixture } from "../catalog-helper";
import { child, freePort, testUrl } from "../helpers";
it("catalog API process restart preserves metadata, scope and durable response-loss command result", async () => {
  const f = await catalogFixture();
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
      },
      root = "http://127.0.0.1:" + port + "/api/v1/";
    const key = randomUUID(),
      body = { name_ja: "Synthetic durable response loss" };
    async function create() {
      const csrf = await (
        await fetch(root + "auth/csrf", { headers: { cookie: f.cookie } })
      ).json();
      return fetch(root + "products", {
        method: "POST",
        headers: {
          cookie: f.cookie,
          origin: f.origin,
          "x-csrf-token": csrf.csrf,
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify(body),
      });
    }
    running = child("apps/api/src/main.ts", env);
    await running.started();
    const first = await create();
    expect(first.status).toBe(200);
    const record = await first.json();
    expect((await running.stop("SIGTERM")).code).toBe(0);
    running = child("apps/api/src/main.ts", env);
    await running.started();
    const second = await create();
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(record);
    expect(
      (
        await fetch(root + "products/" + record.id, {
          headers: { cookie: f.cookie },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await f.db.pool.query("SELECT count(*) FROM products WHERE id=$1", [
          record.id,
        ])
      ).rows[0].count,
    ).toBe("1");
    expect((await running.stop("SIGINT")).code).toBe(0);
    expect(running.output).not.toContain(f.key.toString("base64"));
    expect(running.output).not.toContain(f.cookie);
  } finally {
    running?.dispose();
    await f.cleanup();
  }
}, 30000);
