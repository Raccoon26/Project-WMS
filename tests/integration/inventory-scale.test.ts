import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem, platform } from "node:os";
import { inventoryFixture } from "../inventory-helper";
import { seedInventory } from "../../scripts/inventory-fixture";
import { catalogUser } from "../catalog-access-helper";
it.each([60, 120, 1000])(
  "synthetic %i SKU actual double-entry accounts, indexed keyset and projection invariants",
  async (count) => {
    const f = await inventoryFixture();
    try {
      const start = performance.now();
      const seeded = await seedInventory(
        f.db,
        f.schema,
        f.bootstrap.id,
        f.key,
        count,
        {
          token: f.cookie.split("=")[1]!,
          csrf: f.csrf,
          origin: f.origin,
          ip: "synthetic",
          requestId: "scale",
        },
      );
      await f.invariant();
      expect(
        (
          await f.db.pool.query(
            "SELECT count(DISTINCT sku_id) FROM inventory_accounts",
          )
        ).rows[0].count,
      ).toBe(String(count));
      const stocks = (
        await f.db.pool.query(
          "SELECT a.sku_id,a.warehouse_id,a.kind,b.quantity,b.reserved FROM inventory_accounts a JOIN inventory_balances b ON b.account_id=a.id WHERE a.kind<>'external_boundary'",
        )
      ).rows;
      for (const scenario of seeded.scenarios) {
        for (const [i, bucket] of ["external", "fba", "rsl"].entries()) {
          const row = stocks.find(
            (r) =>
              r.sku_id === scenario.id &&
              r.warehouse_id === seeded.warehouses[i] &&
              r.kind === "good",
          );
          expect(row.quantity).toBe(String(scenario.good[bucket]));
          expect(row.reserved).toBe(String(scenario.reserved[bucket]));
          expect((BigInt(row.quantity) - BigInt(row.reserved)).toString()).toBe(
            String(scenario.expected_available[bucket]),
          );
        }
        expect(
          stocks
            .filter((r) => r.sku_id === scenario.id && r.kind === "transit")
            .reduce((q, r) => q + BigInt(r.quantity), 0n)
            .toString(),
        ).toBe(String(scenario.in_transit));
      }
      const times = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        const response = await f.request("inventory?limit=25");
        expect(response.statusCode).toBe(200);
        expect(response.json().items).toHaveLength(25);
        times.push(performance.now() - start);
      }
      const page = (await f.request("inventory?limit=25")).json();
      const next = await f.request(
        "inventory?limit=25&cursor=" + encodeURIComponent(page.nextCursor),
      );
      expect(next.statusCode).toBe(200);
      expect(
        new Set([...page.items, ...next.json().items].map((r) => r.id)).size,
      ).toBe(50);
      const sku = (
        await f.db.pool.query("SELECT sku_id FROM inventory_entries LIMIT 1")
      ).rows[0].sku_id;
      const plan = (
        await f.db.pool.query(
          "EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM inventory_entries WHERE sku_id=$1 ORDER BY recorded_at,id LIMIT 100",
          [sku],
        )
      ).rows;
      const size = (
        await f.db.pool.query(
          "SELECT pg_database_size(current_database())::text AS size",
        )
      ).rows[0].size;
      const indexes = (
        await f.db.pool.query(
          "SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND tablename='inventory_entries'",
          [f.schema],
        )
      ).rows;
      times.sort((a, b) => a - b);
      mkdirSync("test-results", { recursive: true });
      writeFileSync(
        "test-results/inventory-scale-" + count + ".json",
        JSON.stringify(
          {
            count,
            entries: (
              await f.db.pool.query("SELECT count(*) FROM inventory_entries")
            ).rows[0].count,
            elapsedMs: performance.now() - start,
            node: process.version,
            os: platform(),
            cpu: cpus()[0]?.model,
            hostRAM: totalmem(),
            p50: times[10],
            p95: times[18],
            rssSharedRunner: process.memoryUsage().rss,
            databaseSize: size,
            plan,
            indexes,
            errors: 0,
          },
          null,
          2,
        ),
      );
    } finally {
      await f.cleanup();
    }
  },
  90000,
);
it("50 SKU concurrent reservation/posting requests preserve balances without a global inventory mutex", async () => {
  const f = await inventoryFixture();
  try {
    const actor = await catalogUser(f, ["Manager"]);
    const ids: string[] = [];
    // Explicit synthetic fixtures; all API writes still exercise real authorization.
    for (let i = 0; i < 50; i++) {
      const sku = await f.create("skus", {
        product_id: f.product.id,
        code: "CONCURRENT-" + i,
      });
      ids.push(sku.id);
    }
    await f.db.pool.query("DELETE FROM auth_attempts");
    const opening = await Promise.all(
      ids.map((id) =>
        f.command("inventory/openings", {
          ...f.evidence(),
          sku_id: id,
          sku_version: 1,
          warehouse_id: f.warehouse.id,
          quantity: "100",
        }),
      ),
    );
    expect(opening.every((r) => r.statusCode === 200)).toBe(true);
    await f.db.pool.query("DELETE FROM auth_attempts");
    const drafts = await Promise.all(
      ids.map((id) =>
        f.command("outbounds", {
          business_ref: randomUUID(),
          source_warehouse_id: f.warehouse.id,
          destination_warehouse_id: f.destination.id,
          lines: [{ sku_id: id, sku_version: 1, quantity: "70" }],
        }),
      ),
    );
    expect(drafts.every((r) => r.statusCode === 200)).toBe(true);
    await f.db.pool.query("DELETE FROM auth_attempts");
    const start = performance.now();
    const responses = await Promise.all(
      drafts.map((r, i) =>
        (i % 2 ? actor.request : f.request)(
          "outbounds/" + r.json().id + "/reserve",
          { version: "1" },
          "POST",
          { "idempotency-key": randomUUID() },
        ),
      ),
    );
    expect(responses.every((r) => r.statusCode === 200)).toBe(true);
    await f.invariant();
    expect(
      (
        await f.db.pool.query(
          "SELECT count(*) FROM inventory_balances WHERE reserved=70",
        )
      ).rows[0].count,
    ).toBe("50");
    mkdirSync("test-results", { recursive: true });
    writeFileSync(
      "test-results/inventory-concurrent-50.json",
      JSON.stringify({
        concurrent: 50,
        distinctAuthenticatedActors: 2,
        elapsedMs: performance.now() - start,
        failed: responses.filter((r) => r.statusCode !== 200).length,
      }),
    );
  } finally {
    await f.cleanup();
  }
}, 90000);
