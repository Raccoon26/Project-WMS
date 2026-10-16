import { beforeEach, afterEach, it, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { inventoryFixture } from "../inventory-helper";
import { catalogUser } from "../catalog-access-helper";
import { InventoryService } from "../../apps/api/src/inventory/service";
let f: Awaited<ReturnType<typeof inventoryFixture>>;
beforeEach(async () => {
  f = await inventoryFixture();
});
afterEach(async () => {
  await f?.cleanup();
});
const body = () => ({
  ...f.evidence(),
  sku_id: f.sku.id,
  sku_version: 1,
  warehouse_id: f.warehouse.id,
  quantity: "100",
});
async function count(table: string) {
  return (await f.db.pool.query("SELECT count(*) FROM " + table)).rows[0].count;
}
it("inventory: rollback", async () => {
  const baseline = await count("audit_events");
  await f.db.pool.query(
    "CREATE FUNCTION fail_inventory_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_FAILURE'; END $$; CREATE TRIGGER fail_inventory_outbox BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION fail_inventory_outbox()",
  );
  expect((await f.command("inventory/openings", body())).statusCode).toBe(500);
  for (const table of [
    "inventory_transactions",
    "inventory_entries",
    "inventory_accounts",
    "inventory_balances",
    "inventory_evidence",
    "command_results",
    "outbox",
  ]) {
    const n = await count(table);
    expect(n).toBe(table === "command_results" ? "4" : "0");
  }
  expect(await count("audit_events")).toBe(baseline);
  await f.invariant();
});
it.each([
  "inventory_entries",
  "inventory_balances",
  "audit_events",
  "reservations",
])("L08-L12 %s failures leave no partial posting", async (table) => {
  await f.opening();
  const o = await f.draft();
  if (table !== "reservations")
    expect(
      (await f.command("outbounds/" + o.id + "/reserve", { version: "1" }))
        .statusCode,
    ).toBe(200);
  const tables = [
    "inventory_entries",
    "inventory_transactions",
    "inventory_evidence",
    "inventory_accounts",
    "inventory_balances",
    "reservations",
    "shipments",
    "shipment_lines",
    "receipts",
    "receipt_lines",
    "outbox",
    "audit_events",
  ];
  const before = await Promise.all(tables.map(count));
  await f.db.pool.query(
    `CREATE FUNCTION fail_inventory_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_FAILURE'; END $$; CREATE TRIGGER fail_inventory_write BEFORE ${table === "inventory_balances" ? "UPDATE" : "INSERT"} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_inventory_write()`,
  );
  const r =
    table === "reservations"
      ? await f.command("outbounds/" + o.id + "/reserve", { version: "1" })
      : await f.command("outbounds/" + o.id + "/shipments", {
          ...f.evidence(),
          sku_id: f.sku.id,
          sku_version: 1,
          version: "2",
          line_id: o.line.id,
          quantity: "95",
        });
  expect(r.statusCode).toBeGreaterThanOrEqual(500);
  expect(await Promise.all(tables.map(count))).toEqual(before);
  await f.invariant();
});
it("L01-L04 direct SQL cannot unbalance, edit, delete or corrupt balances", async () => {
  await f.opening();
  const e = (await f.db.pool.query("SELECT * FROM inventory_entries LIMIT 1"))
    .rows[0];
  await expect(
    f.db.pool.query(
      "UPDATE inventory_entries SET quantity=quantity+1 WHERE id=$1",
      [e.id],
    ),
  ).rejects.toThrow("IMMUTABLE");
  await expect(
    f.db.pool.query("DELETE FROM inventory_entries WHERE id=$1", [e.id]),
  ).rejects.toThrow("IMMUTABLE");
  await expect(
    f.db.pool.query(
      "UPDATE inventory_balances SET quantity=quantity+1 WHERE account_id=$1",
      [e.account_id],
    ),
  ).rejects.toThrow("PROJECTION");
  await expect(
    f.db.pool.query(
      "UPDATE inventory_balances SET reserved=1000 WHERE account_id=$1",
      [e.account_id],
    ),
  ).rejects.toThrow();
  const c = await f.db.pool.connect();
  try {
    await c.query("BEGIN");
    const t = (await c.query("SELECT * FROM inventory_transactions LIMIT 1"))
      .rows[0];
    const id = randomUUID(),
      eid = randomUUID(),
      event = randomUUID();
    await c.query(
      "INSERT INTO inventory_evidence(id,source,source_event_id,operation,scope,sku_id,quantity,reference,trust,actor_id,payload_hash,occurred_at) SELECT $1,source,$2,operation,scope,sku_id,quantity,$2,trust,actor_id,payload_hash,occurred_at FROM inventory_evidence WHERE id=$3",
      [eid, event, t.evidence_id],
    );
    await c.query(
      "INSERT INTO inventory_transactions(id,movement_type,reason,reference_type,reference_id,actor_id,source_system,source_event_id,scope,idempotency_key,payload_hash,evidence_id,request_id,occurred_at) VALUES($1,'opening','test','evidence',$2,$3,'synthetic',$4,$5,$4,$6,$2,'direct-test',now())",
      [id, eid, f.bootstrap.id, event, f.warehouse.id, t.payload_hash],
    );
    await c.query(
      "INSERT INTO inventory_entries(id,transaction_id,sku_id,account_id,quantity,line_no,recorded_at) SELECT $1,$2,$3,$4,1,1,recorded_at FROM inventory_transactions WHERE id=$2",
      [randomUUID(), id, e.sku_id, e.account_id],
    );
    await expect(c.query("COMMIT")).rejects.toThrow("UNBALANCED");
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
  await f.invariant();
});
it("L16-L20 wrong SKU, warehouse, shipment and unreserved shipping are rejected", async () => {
  await f.opening();
  const o = await f.draft();
  const b = {
    ...f.evidence(),
    sku_id: f.sku.id,
    sku_version: 1,
    version: "1",
    line_id: o.line.id,
    quantity: "1",
  };
  expect(
    (await f.command("outbounds/" + o.id + "/shipments", b)).statusCode,
  ).toBe(409);
  await f.command("outbounds/" + o.id + "/reserve", { version: "1" });
  expect(
    (
      await f.command("outbounds/" + o.id + "/shipments", {
        ...b,
        version: "2",
        sku_id: randomUUID(),
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await f.command("inbounds/" + o.inbound_id + "/receipts", {
        ...f.evidence(),
        sku_id: f.sku.id,
        sku_version: 1,
        version: "1",
        shipment_line_id: randomUUID(),
        quantity: "1",
        condition: "good",
      })
    ).statusCode,
  ).toBe(422);
  expect(await count("inventory_transactions")).toBe("1");
  await f.invariant();
});
it("L19 over-receipt is held without stock inflation and L21-L22 partial cancellation keeps reservation", async () => {
  await f.opening();
  const o = await f.draft();
  await f.command("outbounds/" + o.id + "/reserve", { version: "1" });
  const sh = (
    await f.command("outbounds/" + o.id + "/shipments", {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      version: "2",
      line_id: o.line.id,
      quantity: "95",
    })
  ).json();
  await f.db.pool.query(
    "UPDATE reservations SET expires_at=now()-interval '1 day'",
  );
  expect(
    (await f.command("outbounds/" + o.id + "/cancel", { version: "3" })).json(),
  ).toMatchObject({ state: "cancellation_requested", release_allowed: false });
  const r = await f.command("inbounds/" + o.inbound_id + "/receipts", {
    ...f.evidence(),
    sku_id: f.sku.id,
    sku_version: 1,
    version: "1",
    shipment_line_id: sh.shipment_line_id,
    quantity: "96",
    condition: "good",
  });
  expect(r.statusCode).toBe(200);
  expect(r.json().state).toBe("held");
  expect(
    (
      await f.db.pool.query(
        "SELECT quantity FROM inventory_balances b JOIN inventory_accounts a ON a.id=b.account_id WHERE kind='transit'",
      )
    ).rows[0].quantity,
  ).toBe("95");
  expect(
    (
      await f.db.pool.query(
        "SELECT reserved FROM inventory_balances b JOIN inventory_accounts a ON a.id=b.account_id WHERE kind='good'",
      )
    ).rows[0].reserved,
  ).toBe("5");
  await f.invariant();
});
it("L23-L27 reversal availability, stale SKU and conflicting source events fail closed", async () => {
  const opening = await f.opening();
  const o = await f.draft();
  await f.command("outbounds/" + o.id + "/reserve", { version: "1" });
  expect(
    (
      await f.command("inventory/reversals", {
        ...f.evidence(),
        transaction_id: opening.id,
      })
    ).statusCode,
  ).toBe(422);
  expect(
    (await f.command("inventory/openings", { ...body(), sku_version: 2 }))
      .statusCode,
  ).toBe(409);
  const b = { ...body(), source_event_id: randomUUID() };
  const first = await f.command("inventory/reclassifications", {
    ...b,
    quantity: "1",
    from_kind: "good",
    to_kind: "damaged",
  });
  expect(first.statusCode).toBe(422);
  await f.invariant();
});
it("RBAC scoped inventory read and both-endpoint transfer permission deny IDOR and writes", async () => {
  await f.opening();
  const viewer = await catalogUser(f, ["Viewer"], f.warehouse.id);
  expect((await viewer.request("inventory")).json().items).toHaveLength(1);
  expect(
    (await viewer.request("inventory?warehouse_id=" + f.destination.id))
      .statusCode,
  ).toBe(403);
  expect(
    (
      await viewer.request("inventory/openings", body(), "POST", {
        "idempotency-key": randomUUID(),
      })
    ).statusCode,
  ).toBe(403);
  const account = (
    await f.db.pool.query(
      "SELECT id FROM inventory_accounts WHERE sku_id=$1 AND kind='good'",
      [f.sku.id],
    )
  ).rows[0].id;
  expect(
    (
      await viewer.request(
        "reconciliations",
        {
          ...f.evidence(),
          account_id: account,
          warehouse_id: f.warehouse.id,
          observed: "100",
          as_of: new Date().toISOString(),
        },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(403);
  const manager = await catalogUser(f, ["Manager"], f.warehouse.id);
  expect(
    (
      await manager.request(
        "transfers",
        {
          business_ref: randomUUID(),
          source_warehouse_id: f.warehouse.id,
          destination_warehouse_id: f.destination.id,
          lines: [{ sku_id: f.sku.id, sku_version: 1, quantity: "1" }],
        },
        "POST",
        { "idempotency-key": randomUUID() },
      )
    ).statusCode,
  ).toBe(403);
  expect((await f.app.inject("/api/v1/inventory")).statusCode).toBe(401);
});
it("revoked permission and CSRF cannot commit a posting or replay stored sensitive result", async () => {
  const user = await catalogUser(f, ["Manager"]);
  const b = body();
  const key = randomUUID();
  const post = () =>
    user.request("inventory/openings", b, "POST", { "idempotency-key": key });
  expect((await post()).statusCode).toBe(200);
  await f.request("users/" + user.id + "/roles", { roles: ["Viewer"] }, "PUT");
  expect((await post()).statusCode).toBe(403);
  expect(
    (
      await f.app.inject({
        url: "/api/v1/inventory/openings",
        method: "POST",
        headers: {
          cookie: f.cookie,
          origin: f.origin,
          "idempotency-key": randomUUID(),
        },
        payload: body(),
      })
    ).statusCode,
  ).toBe(403);
  await f.invariant();
});
it("L13 durable response-loss replay reauthorizes and returns one committed posting", async () => {
  const b = body(),
    key = randomUUID(),
    first = await f.command("inventory/openings", b, key);
  const service = new InventoryService(f.service, f.key);
  const result = await service.command(
    {
      token: f.cookie.split("=")[1]!,
      csrf: f.csrf,
      origin: f.origin,
      ip: "synthetic",
      requestId: "restart",
    },
    "opening",
    b,
    key,
  );
  expect(result).toEqual(first.json());
  expect(await count("inventory_transactions")).toBe("1");
  await f.invariant();
});
it("invalid bigint and malicious extra fields cannot leak logs or change balances", async () => {
  for (const q of ["-1", "1.5", "1e9", "0001", "9223372036854775808"])
    expect(
      (await f.command("inventory/openings", { ...body(), quantity: q }))
        .statusCode,
    ).toBe(400);
  const sensitive = randomBytes(24).toString("base64url");
  const r = await f.command("inventory/openings", {
    ...body(),
    verified: true,
    password: sensitive,
  });
  expect(r.statusCode).toBe(400);
  expect(r.body).not.toMatch(/stack|SELECT/);
  expect(r.body).not.toContain(sensitive);
  expect(f.logs.join("")).not.toContain(sensitive);
  expect(await count("inventory_entries")).toBe("0");
});
it("unknown external shipment evidence holds aggregate and never releases expired reservations", async () => {
  await f.opening();
  const o = await f.draft();
  await f.command("outbounds/" + o.id + "/reserve", { version: "1" });
  const r = await f.command("outbounds/" + o.id + "/shipments", {
    ...f.evidence(),
    source: "external",
    sku_id: f.sku.id,
    sku_version: 1,
    version: "2",
    line_id: o.line.id,
    quantity: "95",
  });
  expect(r.statusCode).toBe(200);
  expect(r.json().state).toBe("held");
  await f.db.pool.query(
    "UPDATE reservations SET expires_at=now()-interval '1 day'",
  );
  expect(
    (await f.command("outbounds/" + o.id + "/release", { version: "3" }))
      .statusCode,
  ).toBe(409);
  expect(
    (
      await f.db.pool.query(
        "SELECT reserved FROM inventory_balances b JOIN inventory_accounts a ON a.id=b.account_id WHERE kind='good'",
      )
    ).rows[0].reserved,
  ).toBe("100");
  expect(await count("inventory_transactions")).toBe("1");
  await f.invariant();
});
it("same physical event with another key and changed payload cannot create a second stock movement", async () => {
  await f.opening();
  const b = {
    ...f.evidence(),
    sku_id: f.sku.id,
    sku_version: 1,
    warehouse_id: f.warehouse.id,
    quantity: "1",
    from_kind: "good",
    to_kind: "quarantine",
  };
  expect((await f.command("inventory/reclassifications", b)).statusCode).toBe(
    200,
  );
  expect(
    (await f.command("inventory/reclassifications", { ...b, quantity: "2" }))
      .statusCode,
  ).toBe(409);
  expect(await count("inventory_transactions")).toBe("2");
  await f.invariant();
});
it("inactive SKU, parent Product and Warehouse never accept new stock commands", async () => {
  for (const [table, id] of [
    ["skus", f.sku.id],
    ["products", f.product.id],
    ["warehouses", f.warehouse.id],
  ]) {
    await f.db.pool.query(`UPDATE ${table} SET status='inactive' WHERE id=$1`, [
      id,
    ]);
    expect((await f.command("inventory/openings", body())).statusCode).toBe(
      422,
    );
    await f.db.pool.query(`UPDATE ${table} SET status='active' WHERE id=$1`, [
      id,
    ]);
  }
  expect(await count("inventory_entries")).toBe("0");
});
it("warehouse location FK, duplicate account race and foreign SKU entry cannot escape DB constraints", async () => {
  await f.opening();
  const loc = await f.create("warehouses/" + f.destination.id + "/locations", {
    code: "FOREIGN-LOC",
    name: "Synthetic foreign bin",
  });
  await expect(
    f.db.pool.query(
      "INSERT INTO inventory_accounts(id,sku_id,warehouse_id,location_id,kind) VALUES($1,$2,$3,$4,'good')",
      [randomUUID(), f.sku.id, f.warehouse.id, loc.id],
    ),
  ).rejects.toThrow();
  const other = await f.create("skus", {
    product_id: f.product.id,
    code: "OTHER-SKU",
  });
  const rows = (
    await f.db.pool.query("SELECT * FROM inventory_entries LIMIT 1")
  ).rows[0];
  await expect(
    f.db.pool.query(
      "INSERT INTO inventory_entries(id,transaction_id,sku_id,account_id,quantity,line_no,recorded_at) VALUES($1,$2,$3,$4,1,3,$5)",
      [
        randomUUID(),
        rows.transaction_id,
        other.id,
        rows.account_id,
        rows.recorded_at,
      ],
    ),
  ).rejects.toThrow();
  await f.invariant();
});
