import { beforeEach, afterEach, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { catalogFixture } from "../catalog-helper";
import { seedCatalog } from "../../scripts/catalog-fixture";
import { canonicalPayload } from "@wms/domain";
import { digest } from "../../apps/api/src/auth/crypto";
import { skus } from "@wms/db";
import { CatalogService } from "../../apps/api/src/catalog/service";
import { writeFileSync, mkdirSync } from "node:fs";
let f: Awaited<ReturnType<typeof catalogFixture>>;
beforeEach(async () => {
  f = await catalogFixture();
});
afterEach(async () => {
  await f?.cleanup();
});
const patch = async (path: string, data: unknown) =>
  f.request(path, data, "PATCH");
it("catalog: unique sku", async () => {
  const attempts = await Promise.all(
    [" test-sku ", "TEST-SKU"].map((code) =>
      f.request("skus", { product_id: f.product.id, code }, "POST", {
        "idempotency-key": randomUUID(),
      }),
    ),
  );
  expect(attempts.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  expect(
    (await f.db.pool.query("SELECT count(*) FROM skus WHERE code='TEST-SKU'"))
      .rows[0].count,
  ).toBe("1");
  await expect(
    f.db.pool.query(
      "INSERT INTO skus(id,product_id,code,created_by,updated_by) VALUES($1,$2,$3,$4,$4)",
      [randomUUID(), f.product.id, "test-sku", f.bootstrap.id],
    ),
  ).rejects.toThrow();
});
it("barcode and warehouse code unique constraints survive concurrent registrations", async () => {
  const r = await Promise.all(
    ["BAR-A", "BAR-B"].map((code) =>
      f.request(
        "skus",
        { product_id: f.product.id, code, barcode: "12345678" },
        "POST",
        { "idempotency-key": randomUUID() },
      ),
    ),
  );
  expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
  const warehouses = await Promise.all(
    [" same-wh ", "SAME-WH"].map((code) =>
      f.request(
        "warehouses",
        { code, name: "Synthetic", type: "external_email" },
        "POST",
        { "idempotency-key": randomUUID() },
      ),
    ),
  );
  expect(warehouses.map((x) => x.statusCode).sort()).toEqual([200, 409]);
});
it("catalog: optimistic concurrency", async () => {
  const r = await Promise.all(
    ["First", "Second"].map((name_ja) =>
      patch("products/" + f.product.id, { version: 1, name_ja }),
    ),
  );
  expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
  const row = (await f.request("products/" + f.product.id)).json();
  expect(row.version).toBe(2);
  expect(["First", "Second"]).toContain(row.name_ja);
});
it("durable command results handle concurrent keys, response loss and changed payloads", async () => {
  const key = randomUUID(),
    input = { name_ja: "Idempotent" };
  const results = await Promise.all([
    f.request("products", input, "POST", { "idempotency-key": key }),
    f.request("products", input, "POST", { "idempotency-key": key }),
  ]);
  expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
  expect(results[0]!.json()).toEqual(results[1]!.json());
  const restarted = new CatalogService(f.service, f.key);
  const ctx = {
    token: f.cookie.split("=")[1]!,
    csrf: f.csrf,
    origin: f.origin,
    ip: "synthetic",
    requestId: "response-loss",
  };
  expect(await restarted.change(ctx, "products", input, key)).toEqual(
    results[0]!.json(),
  );
  expect(
    (
      await f.request("products", { name_ja: "Changed" }, "POST", {
        "idempotency-key": key,
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await f.db.pool.query("SELECT count(*) FROM products WHERE name_ja=$1", [
        "Idempotent",
      ])
    ).rows[0].count,
  ).toBe("1");
});
it("product status controls SKU eligibility without deleting stable metadata", async () => {
  const sku = await f.create("skus", {
    code: "ACTIVE-SKU",
    product_id: f.product.id,
  });
  expect(
    (
      await patch("products/" + f.product.id, {
        version: 1,
        status: "inactive",
      })
    ).statusCode,
  ).toBe(200);
  expect((await f.request("skus/" + sku.id)).json().catalog_active).toBe(false);
  expect(
    (
      await f.request(
        "skus",
        { code: "INACTIVE-PARENT", product_id: f.product.id },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(422);
  await patch("products/" + f.product.id, {
    version: 2,
    status: "discontinued",
  });
  expect(
    (await patch("products/" + f.product.id, { version: 3, status: "active" }))
      .statusCode,
  ).toBe(422);
  await expect(
    f.db.pool.query("DELETE FROM products WHERE id=$1", [f.product.id]),
  ).rejects.toThrow();
});
it("catalog: mapping integrity", async () => {
  const sku = await f.create("skus", {
      code: "MAP-SKU",
      product_id: f.product.id,
    }),
    other = await f.create("skus", {
      code: "MAP-OTHER",
      product_id: f.product.id,
    });
  const account = await f.create("integration-accounts", {
    provider: "amazon",
    account_ref: "synthetic-a",
    name: "Synthetic A",
  });
  const second = await f.create("integration-accounts", {
    provider: "amazon",
    account_ref: "synthetic-b",
    name: "Synthetic B",
  });
  const body = {
    account_id: account.id,
    provider: "amazon",
    marketplace: "JP",
    external_code: "Case-Sensitive",
  };
  const r = await Promise.all(
    [sku, other].map((x) =>
      f.request("skus/" + x.id + "/mappings", body, "POST", {
        "idempotency-key": randomUUID(),
      }),
    ),
  );
  expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
  expect(
    (
      await f.request(
        "skus/" + sku.id + "/mappings",
        { ...body, account_id: second.id },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await f.request(
        "skus/" + sku.id + "/mappings",
        { ...body, provider: "rakuten" },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(422);
  expect(
    (
      await f.request(
        "skus/" + sku.id + "/mappings",
        { ...body, external_code: "new", trust: "provider_verified" },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(400);
});
it("mapping replacement retains identity history and invalidates local review evidence", async () => {
  const sku = await f.create("skus", {
      code: "STABLE-SKU",
      product_id: f.product.id,
    }),
    account = await f.create("integration-accounts", {
      provider: "rakuten",
      account_ref: "synthetic",
      name: "Synthetic",
    });
  const mapping = await f.create("skus/" + sku.id + "/mappings", {
    account_id: account.id,
    provider: "rakuten",
    marketplace: "JP",
    external_code: "Original",
  });
  const reviewed = (
    await patch("mappings/" + mapping.id, {
      version: 1,
      trust: "local_reviewed",
    })
  ).json();
  expect(reviewed.trust).toBe("local_reviewed");
  expect(reviewed.evidence_source).toBe("local_manual");
  const replaced = await patch("mappings/" + mapping.id, {
    version: 2,
    external_code: "Replacement",
  });
  expect(replaced.statusCode).toBe(200);
  expect(replaced.json().id).not.toBe(mapping.id);
  expect(replaced.json().replaces_id).toBe(mapping.id);
  expect(replaced.json().trust).toBe("unverified");
  const old = (
    await f.db.pool.query("SELECT * FROM sku_mappings WHERE id=$1", [
      mapping.id,
    ])
  ).rows[0];
  expect(old.status).toBe("inactive");
  expect(old.external_code).toBe("Original");
  expect(
    (await patch("skus/" + sku.id, { version: 1, code: "SILENT-CHANGE" }))
      .statusCode,
  ).toBe(422);
  expect(
    (await f.request("skus/" + sku.id + "/mappings")).json().items,
  ).toHaveLength(2);
});
it("location composite FKs and DB cycle trigger protect direct SQL writes", async () => {
  const a = await f.create("warehouses/" + f.warehouse.id + "/locations", {
      code: "ZONE",
      name: "Zone",
    }),
    b = await f.create("warehouses/" + f.warehouse.id + "/locations", {
      code: "SHELF",
      name: "Shelf",
      parent_id: a.id,
    });
  expect(
    (await patch("locations/" + a.id, { version: 1, parent_id: b.id }))
      .statusCode,
  ).toBe(422);
  const w = await f.create("warehouses", {
    code: "B",
    name: "Warehouse B",
    type: "external_email",
  });
  expect(
    (
      await f.request(
        "warehouses/" + w.id + "/locations",
        { code: "BAD", name: "Invalid", parent_id: a.id },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(422);
  await expect(
    f.db.pool.query("UPDATE locations SET parent_id=$1 WHERE id=$2", [
      b.id,
      a.id,
    ]),
  ).rejects.toThrow();
  expect(
    (await patch("locations/" + a.id, { version: 1, status: "inactive" }))
      .statusCode,
  ).toBe(422);
});
it("concurrent location reparenting cannot create A-B-A cycles and rolls back losing hierarchy", async () => {
  const a = await f.create("warehouses/" + f.warehouse.id + "/locations", {
      code: "TREE-A",
      name: "A",
    }),
    b = await f.create("warehouses/" + f.warehouse.id + "/locations", {
      code: "TREE-B",
      name: "B",
    });
  const r = await Promise.all([
    patch("locations/" + a.id, { version: 1, parent_id: b.id }),
    patch("locations/" + b.id, { version: 1, parent_id: a.id }),
  ]);
  expect(r.map((x) => x.statusCode).sort()).toEqual([200, 422]);
  const rows = (await f.db.pool.query("SELECT parent_id FROM locations")).rows;
  expect(rows.filter((x) => x.parent_id === null)).toHaveLength(1);
});
it("catalog: transaction rollback", async () => {
  await f.db.pool.query(
    "CREATE FUNCTION fail_catalog_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$; CREATE TRIGGER catalog_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_catalog_audit()",
  );
  const key = randomUUID();
  expect(
    (
      await f.request("products", { name_ja: "Must rollback" }, "POST", {
        "idempotency-key": key,
      })
    ).statusCode,
  ).toBeGreaterThanOrEqual(500);
  expect(
    (
      await f.db.pool.query(
        "SELECT 1 FROM products WHERE name_ja='Must rollback'",
      )
    ).rowCount,
  ).toBe(0);
  expect(
    (await f.db.pool.query("SELECT 1 FROM command_results WHERE key=$1", [key]))
      .rowCount,
  ).toBe(0);
});
it("catalog mutations append actor version and before-after digest in the existing audit chain", async () => {
  await patch("products/" + f.product.id, { name_ja: "Changed", version: 1 });
  const events = (
    await f.db.pool.query(
      "SELECT * FROM audit_events WHERE action LIKE 'products.%' ORDER BY sequence",
    )
  ).rows;
  expect(events).toHaveLength(2);
  expect(events[1].before_digest).toMatch(/^[a-f0-9]{64}$/);
  expect(events[1].after_digest).not.toBe(events[1].before_digest);
  expect(events[1].actor_id).toBe(f.bootstrap.id);
  const revision = (
    await f.db.pool.query(
      "SELECT snapshot FROM catalog_revisions WHERE entity_id=$1 AND version=2",
      [f.product.id],
    )
  ).rows[0].snapshot;
  expect(events[1].after_digest).toBe(
    digest(JSON.stringify(canonicalPayload(revision))),
  );
});
it.each([60, 120, 1000])(
  "real synthetic catalog %i SKU persists, searches and paginates without a stock engine",
  async (count) => {
    const source = await seedCatalog(f.db, f.schema, f.bootstrap.id, count);
    expect(source.skus).toHaveLength(count);
    let cursor = "",
      durations: number[] = [];
    const ids: string[] = [];
    do {
      const start = performance.now();
      const r = await f.request(
        "skus?sort=code&limit=100" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
      durations.push(performance.now() - start);
      expect(r.statusCode).toBe(200);
      expect(r.json().items.length).toBeLessThanOrEqual(100);
      ids.push(...r.json().items.map((x: { id: string }) => x.id));
      cursor = r.json().nextCursor ?? "";
    } while (cursor);
    expect(ids.length).toBe(count);
    expect(new Set(ids).size).toBe(count);
    expect((await f.request("skus?q=TEST-SKU-0001")).json().items).toHaveLength(
      1,
    );
    expect((await f.request("skus?q=TEST-AMZ-0001")).json().items).toHaveLength(
      1,
    );
    expect((await f.request("skus?q=NO-SUCH-CODE")).json().items).toHaveLength(
      0,
    );
    expect(
      (await f.request("skus?status=inactive")).json().items.length,
    ).toBeGreaterThan(0);
    const item = (await f.request("skus?q=TEST-SKU-0001")).json().items[0];
    expect(
      (
        await patch("skus/" + item.id, {
          version: item.version,
          barcode: "98765432",
        })
      ).statusCode,
    ).toBe(200);
    expect((await f.request("skus?q=98765432")).json().items).toHaveLength(1);
    expect(
      await f.db.orm.select({ id: skus.id }).from(skus).limit(1),
    ).toHaveLength(1);
    await f.db.pool.query(
      "ANALYZE skus; ANALYZE products; ANALYZE sku_mappings",
    );
    const searchDurations: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const result = await f.request(
        "skus?q=TEST-SKU-" + String(i + 1).padStart(4, "0"),
      );
      expect(result.statusCode).toBe(200);
      expect(result.json().items).toHaveLength(1);
      searchDurations.push(performance.now() - start);
    }
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () => f.request("skus?limit=25&sort=code")),
    );
    expect(concurrent.every((r) => r.statusCode === 200)).toBe(true);
    const indexes = (
      await f.db.pool.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname=$1",
        [f.schema],
      )
    ).rows.map((r) => r.indexname);
    for (const index of [
      "products_name_search",
      "skus_code_search",
      "skus_barcode_search",
      "sku_mappings_code_search",
      "skus_code_page",
      "sku_mappings_active_external",
    ])
      expect(indexes).toContain(index);
    const searchPlan = (
      await f.db.pool.query(
        "EXPLAIN (FORMAT JSON) SELECT id FROM skus WHERE code ILIKE '%0001%' LIMIT 25",
      )
    ).rows;
    searchDurations.sort((a, b) => a - b);
    const plan = (
      await f.db.pool.query(
        "EXPLAIN (FORMAT JSON) SELECT id,code FROM skus ORDER BY code,id LIMIT 25",
      )
    ).rows;
    mkdirSync("test-results", { recursive: true });
    durations = durations.sort((a, b) => a - b);
    writeFileSync(
      "test-results/catalog-" + count + ".json",
      JSON.stringify(
        {
          count,
          pages: durations.length,
          concurrency: 1,
          meanMs: durations.reduce((a, b) => a + b, 0) / durations.length,
          p95Ms: durations[Math.ceil(durations.length * 0.95) - 1],
          testProcessRss: process.memoryUsage().rss,
          searchSamples: searchDurations.length,
          searchMeanMs:
            searchDurations.reduce((a, b) => a + b, 0) / searchDurations.length,
          searchP95Ms:
            searchDurations[Math.ceil(searchDurations.length * 0.95) - 1],
          searchPlan,
          concurrentRequests: 4,
          plan,
        },
        null,
        2,
      ),
    );
    expect(
      (
        await f.db.pool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='skus'",
          [f.schema],
        )
      ).rows.map((r) => r.column_name),
    ).not.toContain("good");
  },
);
it("catalog list binds signed cursor to filters, sort, user and current grant set", async () => {
  for (let i = 0; i < 4; i++) await f.create("products", { name_ja: "Same" });
  const page = (await f.request("products?limit=2&sort=name_ja")).json();
  expect(page.items).toHaveLength(2);
  const cursor = encodeURIComponent(page.nextCursor);
  expect(
    (await f.request("products?limit=2&sort=name_ja&cursor=" + cursor)).json()
      .items,
  ).toHaveLength(2);
  expect(
    (
      await f.request(
        "products?limit=2&sort=name_ja&status=active&cursor=" + cursor,
      )
    ).statusCode,
  ).toBe(400);
  expect(
    (await f.request("products?limit=2&sort=name_ja&cursor=" + cursor + "x"))
      .statusCode,
  ).toBe(400);
});
