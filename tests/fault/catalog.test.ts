import { it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { catalogFixture } from "../catalog-helper";
import { catalogUser } from "../catalog-access-helper";
import { buildApi } from "../../apps/api/src/app";
import { logger } from "@wms/runtime";
let f: Awaited<ReturnType<typeof catalogFixture>>;
beforeEach(async () => {
  f = await catalogFixture();
});
afterEach(async () => {
  await f?.cleanup();
});
it("C01-C03 anonymous, Viewer writes and Operator security mutation fail closed", async () => {
  expect((await f.app.inject("/api/v1/products")).statusCode).toBe(401);
  for (const role of ["Viewer", "Operator"]) {
    const u = await catalogUser(f, [role]);
    expect(
      (
        await u.request("products", { name_ja: "Forbidden" }, "POST", {
          "idempotency-key": randomUUID(),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await u.request(
          "users/" + f.bootstrap.id + "/roles",
          { roles: ["Administrator"] },
          "PUT",
        )
      ).statusCode,
    ).toBe(403);
  }
});
it("catalog: warehouse scope", async () => {
  const b = await f.create("warehouses", {
      code: "SCOPE-B",
      name: "Scope B",
      type: "rsl",
    }),
    u = await catalogUser(f, ["Manager"], f.warehouse.id);
  const list = await u.request("warehouses");
  expect(list.statusCode).toBe(200);
  expect(list.json().items.map((r: { id: string }) => r.id)).toEqual([
    f.warehouse.id,
  ]);
  expect((await u.request("warehouses/" + b.id)).statusCode).toBe(403);
  expect(
    (
      await u.request(
        "warehouses/" + b.id,
        { version: 1, name: "Forged" },
        "PATCH",
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await u.request(
        "warehouses/" + f.warehouse.id,
        { version: 1, name: "Allowed A" },
        "PATCH",
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await u.request("products", { name_ja: "Global escalation" }, "POST", {
        "idempotency-key": randomUUID(),
      })
    ).statusCode,
  ).toBe(403);
  expect((await u.request("products")).statusCode).toBe(200);
  expect(
    (
      await u.request(
        "warehouses/" + f.warehouse.id + "/locations",
        { code: "SCOPED", name: "Scoped location" },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (await u.request("warehouses/" + b.id + "/locations")).statusCode,
  ).toBe(403);
});
it("C06-C07 nonexistent scope, forged administrator scope and self escalation are rejected", async () => {
  const u = await catalogUser(f, ["Viewer"]);
  expect(
    (
      await f.request(
        "users/" + u.id + "/warehouse-roles",
        { warehouse_id: randomUUID(), roles: ["Manager"] },
        "PUT",
      )
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await f.request(
        "users/" + u.id + "/warehouse-roles",
        { warehouse_id: f.warehouse.id, roles: ["Administrator"] },
        "PUT",
      )
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await f.request(
        "users/" + f.bootstrap.id + "/warehouse-roles",
        { warehouse_id: f.warehouse.id, roles: ["Manager"] },
        "PUT",
      )
    ).statusCode,
  ).toBe(403);
  await expect(
    f.db.pool.query(
      "INSERT INTO user_roles(id,user_id,role_id,scope,warehouse_id) SELECT $1,$2,id,'warehouse',$3 FROM roles WHERE code='Viewer'",
      [randomUUID(), u.id, randomUUID()],
    ),
  ).rejects.toThrow();
});
it("C08 C29 C35 scope revocation changes existing session and invalidates its cursor", async () => {
  await f.create("warehouses", {
    code: "SECOND-GLOBAL",
    name: "Second",
    type: "fba",
  });
  const u = await catalogUser(f, ["Manager"], f.warehouse.id);
  await f.request("users/" + u.id + "/roles", { roles: ["Viewer"] }, "PUT");
  const first = (await u.request("warehouses?limit=1")).json();
  expect(first.nextCursor).toBeTruthy();
  await f.request("users/" + u.id + "/roles", { roles: [] }, "PUT");
  expect(
    (
      await u.request(
        "warehouses?limit=1&cursor=" + encodeURIComponent(first.nextCursor),
      )
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await f.request(
        "users/" + u.id + "/warehouse-roles",
        { warehouse_id: f.warehouse.id, roles: [] },
        "PUT",
      )
    ).statusCode,
  ).toBe(200);
  expect((await u.request("warehouses/" + f.warehouse.id)).statusCode).toBe(
    403,
  );
  expect((await u.request("auth/me")).json().grants).toHaveLength(0);
});
it("C09-C10 catalog writes require session CSRF and exact browser Origin", async () => {
  for (const extra of [
    { "x-csrf-token": "" },
    { "x-csrf-token": "tampered" },
    { origin: "https://evil.example" },
  ])
    expect(
      (
        await f.request("products", { name_ja: "Malicious" }, "POST", {
          "idempotency-key": randomUUID(),
          ...extra,
        })
      ).statusCode,
    ).toBe(403);
});
it("C15-C16 C32 mappings cannot invent verification or attach to inactive SKU or mismatched provider", async () => {
  const sku = await f.create("skus", {
      code: "INACTIVE-SKU",
      product_id: f.product.id,
    }),
    account = await f.create("integration-accounts", {
      provider: "amazon",
      account_ref: "test",
      name: "Synthetic",
    });
  await f.request(
    "skus/" + sku.id,
    { version: 1, status: "inactive" },
    "PATCH",
  );
  expect(
    (
      await f.request(
        "skus/" + sku.id + "/mappings",
        {
          account_id: account.id,
          provider: "amazon",
          marketplace: "JP",
          external_code: "Fake",
        },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(422);
  expect(
    (
      await f.request(
        "skus/" + sku.id + "/mappings",
        {
          account_id: account.id,
          provider: "amazon",
          marketplace: "JP",
          external_code: "Fake",
          reviewed_by: f.bootstrap.id,
        },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(400);
});
it("C20-C22 stale version, changed command payload and missing create key are explicit conflicts", async () => {
  const key = randomUUID();
  const first = await f.request("products", { name_ja: "Key" }, "POST", {
    "idempotency-key": key,
  });
  expect(first.statusCode).toBe(200);
  expect(
    (
      await f.request("products", { name_ja: "Different" }, "POST", {
        "idempotency-key": key,
      })
    ).statusCode,
  ).toBe(409);
  expect((await f.request("products", { name_ja: "No key" })).statusCode).toBe(
    400,
  );
  await f.request(
    "products/" + f.product.id,
    { version: 1, name_ja: "Latest" },
    "PATCH",
  );
  expect(
    (
      await f.request(
        "products/" + f.product.id,
        { version: 1, name_ja: "Stale" },
        "PATCH",
      )
    ).statusCode,
  ).toBe(409);
});
it("C23 C33 database failure returns safe unavailable and app restart preserves metadata/session", async () => {
  const old = (await f.request("products/" + f.product.id)).json();
  await f.app.close();
  const app = buildApi(
    f.db,
    logger("api", () => {}),
    { pool: f.db.pool, key: f.key.toString("base64"), origin: f.origin },
  );
  try {
    const r = await app.inject({
      url: "/api/v1/products/" + f.product.id,
      headers: { cookie: f.cookie },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual(old);
    await f.db.close();
    const failed = await app.inject({
      url: "/api/v1/products",
      headers: { cookie: f.cookie },
    });
    expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toMatch(/password|SELECT|stack|postgresql/);
  } finally {
    await app.close();
  }
});
it("C24-C25 failing audit rolls back both metadata version and command result", async () => {
  await f.db.pool.query(
    "CREATE FUNCTION reject_catalog_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$; CREATE TRIGGER reject_catalog BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_catalog_change()",
  );
  expect(
    (
      await f.request(
        "warehouses/" + f.warehouse.id,
        { version: 1, name: "Must rollback" },
        "PATCH",
      )
    ).statusCode,
  ).toBeGreaterThanOrEqual(500);
  expect(
    (
      await f.db.pool.query("SELECT name,version FROM warehouses WHERE id=$1", [
        f.warehouse.id,
      ])
    ).rows[0],
  ).toMatchObject({ name: "合成倉庫A", version: 1 });
});
it("C26-C30 SQL injection, unsafe sort, malformed cursor, oversized pages and extra fields rejected", async () => {
  for (const path of [
    "products?sort=name_ja;DROP",
    "products?cursor=forged",
    "products?limit=101",
    "products?limit=0",
  ])
    expect((await f.request(path)).statusCode).toBe(400);
  expect(
    (
      await f.request(
        "products?q=" + encodeURIComponent("'; DROP TABLE skus; --"),
      )
    ).json().items,
  ).toHaveLength(0);
  expect(
    (
      await f.request("products", { name_ja: "X", admin: true }, "POST", {
        "idempotency-key": randomUUID(),
      })
    ).statusCode,
  ).toBe(400);
  const xss = await f.create("products", {
    name_ja: "<img src=x onerror=alert(1)>",
  });
  expect((await f.request("products/" + xss.id)).json().name_ja).toContain(
    "<img",
  );
  expect(f.logs.join("\n")).not.toContain("onerror");
  expect((await f.request("products")).headers["cache-control"]).toBe(
    "no-store",
  );
});
it("C31 inactive warehouse denies new location work but does not invent zero stock", async () => {
  await f.request(
    "warehouses/" + f.warehouse.id,
    { version: 1, status: "inactive" },
    "PATCH",
  );
  expect(
    (
      await f.request(
        "warehouses/" + f.warehouse.id + "/locations",
        { code: "INVALID", name: "Invalid" },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(422);
  const row = (await f.request("warehouses/" + f.warehouse.id)).json();
  expect(row.status).toBe("inactive");
  expect(row).not.toHaveProperty("quantity");
});
it("normal catalog edits do not require repeated MFA while mapping/account writes retain recent reauthentication", async () => {
  await f.db.pool.query(
    "UPDATE sessions SET reauthenticated_at=now()-interval '5 minutes' WHERE token_hash=$1",
    [
      (await import("../../apps/api/src/auth/crypto")).digest(
        f.cookie.split("=")[1]!,
      ),
    ],
  );
  expect(
    (
      await f.request(
        "products/" + f.product.id,
        { version: 1, name_ja: "Routine edit" },
        "PATCH",
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await f.request(
        "integration-accounts",
        { provider: "amazon", account_ref: "test", name: "Test" },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(403);
});
it("catalog input schemas reject blank names, invalid barcode, negative version and forged FK without data mutation", async () => {
  for (const name_ja of ["", "   ", "x".repeat(201), "nul\0name"])
    expect(
      (
        await f.request("products", { name_ja }, "POST", {
          "idempotency-key": randomUUID(),
        })
      ).statusCode,
    ).toBe(400);
  expect(
    (
      await f.request(
        "skus",
        {
          code: "BAD-BARCODE",
          product_id: f.product.id,
          barcode: "not-a-barcode",
        },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await f.request(
        "products/" + f.product.id,
        { version: 0, name_ja: "Bad version" },
        "PATCH",
      )
    ).statusCode,
  ).toBe(400);
  await expect(
    f.db.pool.query(
      "INSERT INTO skus(id,product_id,code,created_by,updated_by) VALUES($1,$2,$3,$4,$4)",
      [randomUUID(), randomUUID(), "FORGED-FK", f.bootstrap.id],
    ),
  ).rejects.toThrow();
  expect(
    (
      await f.db.pool.query(
        "SELECT 1 FROM skus WHERE code IN ('FORGED-FK','BAD-BARCODE')",
      )
    ).rowCount,
  ).toBe(0);
});
