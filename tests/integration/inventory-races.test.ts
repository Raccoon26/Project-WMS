import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { inventoryFixture } from "../inventory-helper";
import { catalogUser } from "../catalog-access-helper";
it("different authenticated actors race the same final stock and opening identity exactly once", async () => {
  const f = await inventoryFixture();
  try {
    const other = await catalogUser(f, ["Manager"]);
    const b = {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      warehouse_id: f.warehouse.id,
      quantity: "100",
    };
    const opening = await Promise.all([
      f.command("inventory/openings", b),
      other.request("inventory/openings", { ...b, ...f.evidence() }, "POST", {
        "idempotency-key": randomUUID(),
      }),
    ]);
    expect(opening.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const a = await f.draft("70"),
      d = await f.draft("70");
    const r = await Promise.all([
      f.command("outbounds/" + a.id + "/reserve", { version: "1" }),
      other.request(
        "outbounds/" + d.id + "/reserve",
        { version: "1" },
        "POST",
        { "idempotency-key": randomUUID() },
      ),
    ]);
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 422]);
    await f.invariant();
  } finally {
    await f.cleanup();
  }
});
it("two partial shipments isolate transit and duplicate concurrent receipts cannot consume another shipment", async () => {
  const f = await inventoryFixture();
  try {
    await f.opening();
    const o = await f.draft();
    await f.command("outbounds/" + o.id + "/reserve", { version: "1" });
    const a = (
      await f.command("outbounds/" + o.id + "/shipments", {
        ...f.evidence(),
        sku_id: f.sku.id,
        sku_version: 1,
        version: "2",
        line_id: o.line.id,
        quantity: "40",
      })
    ).json();
    const b = (
      await f.command("outbounds/" + o.id + "/shipments", {
        ...f.evidence(),
        sku_id: f.sku.id,
        sku_version: 1,
        version: "3",
        line_id: o.line.id,
        quantity: "55",
      })
    ).json();
    const receipt = {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      version: "1",
      shipment_line_id: a.shipment_line_id,
      quantity: "39",
      condition: "damaged",
    };
    const r = await Promise.all(
      [1, 2].map(() =>
        f.command("inbounds/" + o.inbound_id + "/receipts", receipt),
      ),
    );
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    const rows = (
      await f.db.pool.query(
        "SELECT a.shipment_id,b.quantity FROM inventory_accounts a JOIN inventory_balances b ON b.account_id=a.id WHERE a.kind='transit'",
      )
    ).rows;
    expect(rows.find((x) => x.shipment_id === a.shipment_id).quantity).toBe(
      "1",
    );
    expect(rows.find((x) => x.shipment_id === b.shipment_id).quantity).toBe(
      "55",
    );
    await f.invariant();
  } finally {
    await f.cleanup();
  }
});
it("permission revocation waits for an in-flight authorized posting, then denies all subsequent commits", async () => {
  const f = await inventoryFixture();
  try {
    const u = await catalogUser(f, ["Manager"]);
    const c = await f.db.pool.connect();
    await c.query("BEGIN");
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
    let settled = false;
    const pending = u
      .request(
        "inventory/openings",
        {
          ...f.evidence(),
          sku_id: f.sku.id,
          sku_version: 1,
          warehouse_id: f.warehouse.id,
          quantity: "100",
        },
        "POST",
        { "idempotency-key": randomUUID() },
      )
      .then((r) => {
        settled = true;
        return r;
      });
    await c.query("UPDATE user_roles SET revoked_at=now() WHERE user_id=$1", [
      u.id,
    ]);
    expect(settled).toBe(false);
    await c.query("COMMIT");
    c.release();
    expect((await pending).statusCode).toBe(403);
    expect(
      (await f.db.pool.query("SELECT count(*) FROM inventory_entries")).rows[0]
        .count,
    ).toBe("0");
    await f.invariant();
  } finally {
    await f.cleanup();
  }
});
it("direct account FK, SKU mix, location mismatch and committed transaction extension are rejected", async () => {
  const f = await inventoryFixture();
  try {
    await f.opening();
    const e = (await f.db.pool.query("SELECT * FROM inventory_entries LIMIT 1"))
      .rows[0];
    await expect(
      f.db.pool.query(
        "INSERT INTO inventory_entries(id,transaction_id,sku_id,account_id,quantity,line_no,recorded_at) VALUES($1,$2,$3,$4,1,99,$5)",
        [randomUUID(), e.transaction_id, e.sku_id, e.account_id, e.recorded_at],
      ),
    ).rejects.toThrow();
    await expect(
      f.db.pool.query(
        "INSERT INTO inventory_accounts(id,sku_id,warehouse_id,kind) VALUES($1,$2,$3,'transit')",
        [randomUUID(), f.sku.id, f.warehouse.id],
      ),
    ).rejects.toThrow();
    await expect(
      f.db.pool.query(
        "INSERT INTO inventory_accounts(id,sku_id,warehouse_id,kind) VALUES($1,$2,$3,'good')",
        [randomUUID(), f.sku.id, f.warehouse.id],
      ),
    ).rejects.toThrow();
    await f.invariant();
  } finally {
    await f.cleanup();
  }
});
it("failed posting rolls back a consumed reservation as well as entries, evidence and event", async () => {
  const f = await inventoryFixture();
  try {
    await f.opening();
    const o = await f.draft();
    await f.command("outbounds/" + o.id + "/reserve", { version: "1" });
    await f.db.pool.query(
      "CREATE FUNCTION fail_consumed_reservation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.consumed>OLD.consumed THEN RAISE EXCEPTION 'AFTER_CONSUMPTION'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_consumed_reservation AFTER UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION fail_consumed_reservation()",
    );
    const r = await f.command("outbounds/" + o.id + "/shipments", {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      version: "2",
      line_id: o.line.id,
      quantity: "95",
    });
    expect(r.statusCode).toBe(500);
    expect(
      (await f.db.pool.query("SELECT consumed FROM reservations")).rows[0]
        .consumed,
    ).toBe("0");
    expect(
      (await f.db.pool.query("SELECT count(*) FROM shipments")).rows[0].count,
    ).toBe("0");
    await f.invariant();
  } finally {
    await f.cleanup();
  }
});
it("L28 real PostgreSQL deadlock is rolled back and retried once with the same transaction command", async () => {
  const f = await inventoryFixture();
  const external = await f.db.pool.connect();
  try {
    await f.opening();
    await f.db.pool.query(
      "CREATE TABLE inventory_retry_probe(id integer PRIMARY KEY,value integer NOT NULL); INSERT INTO inventory_retry_probe VALUES(1,0),(2,0)",
    );
    await external.query("BEGIN");
    await external.query("SET LOCAL deadlock_timeout='5s'");
    await external.query(
      "SELECT * FROM inventory_retry_probe WHERE id=2 FOR UPDATE",
    );
    let ready!: () => void;
    const waiting = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let compete!: () => void;
    const competitor = new Promise<void>((resolve) => {
      compete = resolve;
    });
    let attempts = 0;
    const { InventoryService } =
      await import("../../apps/api/src/inventory/service");
    const service = new InventoryService(f.service, f.key);
    const posting = service.run(
      {
        token: f.cookie.split("=")[1]!,
        csrf: f.csrf,
        origin: f.origin,
        ip: "synthetic",
        requestId: "deadlock",
      },
      true,
      async (c) => {
        attempts++;
        await c.query("SET LOCAL deadlock_timeout='50ms'");
        await c.query(
          "SELECT * FROM inventory_retry_probe WHERE id=1 FOR UPDATE",
        );
        if (attempts === 1) {
          ready();
          await competitor;
        }
        await c.query(
          "SELECT * FROM inventory_retry_probe WHERE id=2 FOR UPDATE",
        );
        await c.query("UPDATE inventory_retry_probe SET value=value+1");
        return "committed";
      },
    );
    await waiting;
    const other = external.query(
      "SELECT * FROM inventory_retry_probe WHERE id=1 FOR UPDATE",
    );
    compete();
    await other;
    await external.query("COMMIT");
    expect(await posting).toBe("committed");
    expect(attempts).toBe(2);
    expect(
      (
        await f.db.pool.query("SELECT value FROM inventory_retry_probe")
      ).rows.map((r) => r.value),
    ).toEqual([1, 1]);
    await f.invariant();
  } finally {
    await external.query("ROLLBACK");
    external.release();
    await f.cleanup();
  }
}, 30000);
it("DB Commit rejects cross-SKU offsets even when the global entry sum is zero", async () => {
  const f = await inventoryFixture();
  const c = await f.db.pool.connect();
  try {
    await f.opening();
    const other = await f.create("skus", {
      product_id: f.product.id,
      code: "CROSS-SKU",
    });
    const { InventoryService } =
      await import("../../apps/api/src/inventory/service");
    const service = new InventoryService(f.service, f.key);
    await c.query("BEGIN");
    const from = await service.account(c, f.sku.id, null, "external_boundary"),
      to = await service.account(c, other.id, f.warehouse.id, "good");
    const id = randomUUID(),
      eid = randomUUID(),
      event = randomUUID();
    await c.query(
      "INSERT INTO inventory_evidence(id,source,source_event_id,operation,scope,sku_id,quantity,reference,trust,actor_id,payload_hash,occurred_at) VALUES($1,'synthetic',$2,'reclassify',$3,$4,1,$2,'synthetic_test',$5,repeat('0',64),now())",
      [eid, event, f.warehouse.id, f.sku.id, f.bootstrap.id],
    );
    await c.query(
      "INSERT INTO inventory_transactions(id,movement_type,reason,reference_type,reference_id,actor_id,source_system,source_event_id,scope,idempotency_key,payload_hash,evidence_id,request_id,occurred_at) VALUES($1,'reclassify','Synthetic invalid cross SKU','evidence',$2,$3,'synthetic',$4,$5,$4,repeat('0',64),$2,'cross-sku',now())",
      [id, eid, f.bootstrap.id, event, f.warehouse.id],
    );
    await c.query(
      "INSERT INTO inventory_entries(id,transaction_id,sku_id,account_id,quantity,line_no,recorded_at) SELECT $1,$2,$3,$4,-1,1,recorded_at FROM inventory_transactions WHERE id=$2",
      [randomUUID(), id, f.sku.id, from],
    );
    await c.query(
      "INSERT INTO inventory_entries(id,transaction_id,sku_id,account_id,quantity,line_no,recorded_at) SELECT $1,$2,$3,$4,1,2,recorded_at FROM inventory_transactions WHERE id=$2",
      [randomUUID(), id, other.id, to],
    );
    expect(
      (
        await c.query(
          "SELECT sum(quantity)::text AS sum FROM inventory_entries WHERE transaction_id=$1",
          [id],
        )
      ).rows[0].sum,
    ).toBe("0");
    await expect(c.query("COMMIT")).rejects.toThrow("UNBALANCED");
    await f.invariant();
  } finally {
    await c.query("ROLLBACK");
    c.release();
    await f.cleanup();
  }
});
it("SKU code edit racing the first posting waits for its shared lock and cannot rewrite committed ledger meaning", async () => {
  const f = await inventoryFixture();
  let unblock!: () => void;
  let pending: Promise<unknown> | undefined;
  try {
    const u = await catalogUser(f, ["Manager"]);
    const { InventoryService } =
      await import("../../apps/api/src/inventory/service");
    const service = new InventoryService(f.service, f.key);
    const original = service.active.bind(service);
    let entered!: () => void;
    const ready = new Promise<void>((r) => (entered = r)),
      resume = new Promise<void>((r) => (unblock = r));
    service.active = async (...args) => {
      await original(...args);
      entered();
      await resume;
    };
    pending = service.command(
      u.ctx,
      "opening",
      {
        ...f.evidence(),
        sku_id: f.sku.id,
        sku_version: 1,
        warehouse_id: f.warehouse.id,
        quantity: "100",
      },
      randomUUID(),
    );
    await ready;
    const edit = f.request(
      "skus/" + f.sku.id,
      { version: 1, code: "RACING-CODE" },
      "PATCH",
    );
    const { until } = await import("../helpers");
    try {
      await until(
        async () =>
          (
            await f.db.pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE skus%' LIMIT 1",
            )
          ).rowCount === 1,
        5000,
      );
    } finally {
      unblock();
    }
    await pending;
    expect((await edit).statusCode).toBe(422);
    expect(
      (await f.db.pool.query("SELECT code FROM skus WHERE id=$1", [f.sku.id]))
        .rows[0].code,
    ).toBe(f.sku.code);
    await f.invariant();
  } finally {
    unblock?.();
    await pending?.catch(() => {});
    await f.cleanup();
  }
}, 15000);
