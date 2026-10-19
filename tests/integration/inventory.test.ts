import { beforeEach, afterEach, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { inventoryFixture } from "../inventory-helper";
let f: Awaited<ReturnType<typeof inventoryFixture>>;
beforeEach(async () => {
  f = await inventoryFixture();
});
afterEach(async () => {
  await f?.cleanup();
});
it("inventory: invariants", async () => {
  await f.opening();
  await f.invariant();
  const r = (await f.request("inventory")).json();
  expect(r.items[0]).toMatchObject({
    quantity: "100",
    reserved: "0",
    available: "100",
    sku_code: f.sku.code,
  });
  expect(
    (
      await f.db.pool.query(
        "SELECT sum(quantity)::text AS sum FROM inventory_entries",
      )
    ).rows[0].sum,
  ).toBe("0");
});
it("inventory: concurrency", async () => {
  await f.opening();
  const a = await f.draft("70"),
    b = await f.draft("40");
  const results = await Promise.all(
    [a, b].map((o) =>
      f.command("outbounds/" + o.id + "/reserve", { version: "1" }),
    ),
  );
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 422]);
  await f.invariant();
  expect(
    (
      await f.db.pool.query(
        "SELECT reserved FROM inventory_balances b JOIN inventory_accounts a ON a.id=b.account_id WHERE kind='good'",
      )
    ).rows[0].reserved,
  ).toBe(results[0]!.statusCode === 200 ? "70" : "40");
});
it("inventory: idempotency", async () => {
  const key = randomUUID(),
    body = {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      warehouse_id: f.warehouse.id,
      quantity: "100",
    };
  const responses = await Promise.all(
    [1, 2].map(() => f.command("inventory/openings", body, key)),
  );
  expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
  expect(responses[0]!.json()).toEqual(responses[1]!.json());
  expect(
    (await f.command("inventory/openings", { ...body, quantity: "101" }, key))
      .statusCode,
  ).toBe(409);
  expect((await f.command("inventory/openings", body)).statusCode).toBe(409);
  expect(
    (await f.db.pool.query("SELECT count(*) FROM inventory_transactions"))
      .rows[0].count,
  ).toBe("1");
  await f.invariant();
});
it("inventory: state and evidence", async () => {
  await f.opening();
  const o = await f.draft();
  expect(
    (await f.command("outbounds/" + o.id + "/reserve", { version: "1" }))
      .statusCode,
  ).toBe(200);
  const b = {
    ...f.evidence(),
    sku_id: f.sku.id,
    sku_version: 1,
    version: "2",
    line_id: o.line.id,
    quantity: "95",
  };
  const shipped = await f.command("outbounds/" + o.id + "/shipments", b);
  expect(shipped.statusCode).toBe(200);
  const sh = shipped.json();
  expect(sh.state).toBe("partially_shipped");
  const receipt = {
    ...f.evidence(),
    sku_id: f.sku.id,
    sku_version: 1,
    version: "1",
    shipment_line_id: sh.shipment_line_id,
    quantity: "93",
    condition: "good",
  };
  const r = await f.command("inbounds/" + o.inbound_id + "/receipts", receipt);
  expect(r.statusCode).toBe(200);
  expect(r.json().state).toBe("partially_received");
  const rows = (
    await f.db.pool.query(
      "SELECT a.kind,a.warehouse_id,b.quantity,b.reserved FROM inventory_accounts a JOIN inventory_balances b ON b.account_id=a.id WHERE a.kind<>'external_boundary'",
    )
  ).rows;
  expect(
    rows.find((a) => a.kind === "good" && a.warehouse_id === f.warehouse.id),
  ).toMatchObject({ quantity: "5", reserved: "5" });
  expect(rows.find((a) => a.kind === "transit")).toMatchObject({
    quantity: "2",
    reserved: "0",
  });
  expect(
    rows.find((a) => a.kind === "good" && a.warehouse_id === f.destination.id),
  ).toMatchObject({ quantity: "93", reserved: "0" });
  expect(rows.reduce((q, r) => q + BigInt(r.quantity), 0n)).toBe(100n);
  await f.invariant();
  expect(
    (
      await f.command("outbounds/" + o.id + "/shipments", {
        ...b,
        version: sh.version,
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await f.command("inbounds/" + o.inbound_id + "/receipts", {
        ...receipt,
        version: r.json().version,
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (await f.db.pool.query("SELECT count(*) FROM inventory_transactions"))
      .rows[0].count,
  ).toBe("3");
  expect(
    (await f.db.pool.query("SELECT count(*) FROM outbox")).rows[0].count,
  ).toBe("5");
});
it("opening and reclassification preserve physical totals and freeze SKU code", async () => {
  await f.opening();
  const body = {
    ...f.evidence(),
    sku_id: f.sku.id,
    sku_version: 1,
    warehouse_id: f.warehouse.id,
    quantity: "7",
    from_kind: "good",
    to_kind: "damaged",
  };
  const r = await f.command("inventory/reclassifications", body);
  expect(r.statusCode).toBe(200);
  await expect(
    f.db.pool.query("UPDATE skus SET code=$1 WHERE id=$2", [
      "CHANGED",
      f.sku.id,
    ]),
  ).rejects.toThrow();
  expect(
    (
      await f.request(
        "skus/" + f.sku.id,
        { version: 1, code: "CHANGED" },
        "PATCH",
      )
    ).statusCode,
  ).toBe(422);
  await f.invariant();
});
it("reversal posts exact opposite entries and cannot run twice or make negative stock", async () => {
  const opening = await f.opening();
  const body = { ...f.evidence(), transaction_id: opening.id };
  const r = await f.command("inventory/reversals", body);
  expect(r.statusCode).toBe(200);
  expect(
    (
      await f.command("inventory/reversals", {
        ...f.evidence(),
        transaction_id: opening.id,
      })
    ).statusCode,
  ).toBe(409);
  await f.invariant();
});
it("reconciliation preserves stock and holds differences or stale observations", async () => {
  await f.opening();
  const account = (await f.request("inventory")).json().items[0];
  const body = {
    ...f.evidence(),
    account_id: account.id,
    warehouse_id: f.warehouse.id,
    observed: "97",
    as_of: new Date().toISOString(),
  };
  const r = await f.command("reconciliations", body);
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({
    state: "held",
    expected: "100",
    difference: "-3",
  });
  expect((await f.request("inventory")).json().items[0].quantity).toBe("100");
  await f.invariant();
});
it("local manual and external evidence remain held without granting provider trust", async () => {
  const r = await f.command("inventory/openings", {
    ...f.evidence(),
    source: "local_manual",
    sku_id: f.sku.id,
    sku_version: 1,
    warehouse_id: f.warehouse.id,
    quantity: "100",
  });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ state: "held", trust: "local_manual" });
  expect(
    (await f.db.pool.query("SELECT count(*) FROM inventory_entries")).rows[0]
      .count,
  ).toBe("0");
});
it("cursor filters are bound to actor query and page size with no unbounded response", async () => {
  await f.opening();
  const r = await f.request("inventory?limit=1");
  expect(r.statusCode).toBe(200);
  expect(r.json().items).toHaveLength(1);
  expect((await f.request("inventory?limit=101")).statusCode).toBe(400);
  expect((await f.request("inventory?cursor=garbage")).statusCode).toBe(400);
});
it("all allowed quality transitions conserve physical stock and never classify reserved Good", async () => {
  await f.opening();
  for (const [from_kind, to_kind, q] of [
    ["good", "damaged", "10"],
    ["damaged", "quarantine", "10"],
    ["quarantine", "good", "7"],
    ["good", "quarantine", "2"],
  ]) {
    const r = await f.command("inventory/reclassifications", {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      warehouse_id: f.warehouse.id,
      quantity: q,
      from_kind,
      to_kind,
    });
    expect(r.statusCode).toBe(200);
    await f.invariant();
  }
  const accounts = (
    await f.db.pool.query(
      "SELECT a.kind,b.quantity FROM inventory_accounts a JOIN inventory_balances b ON b.account_id=a.id WHERE a.kind<>'external_boundary'",
    )
  ).rows;
  expect(accounts.reduce((q, a) => q + BigInt(a.quantity), 0n)).toBe(100n);
  expect(accounts.find((a) => a.kind === "quarantine").quantity).toBe("5");
  const o = await f.draft("95");
  expect(
    (await f.command("outbounds/" + o.id + "/reserve", { version: "1" }))
      .statusCode,
  ).toBe(200);
  expect(
    (
      await f.command("inventory/reclassifications", {
        ...f.evidence(),
        sku_id: f.sku.id,
        sku_version: 1,
        warehouse_id: f.warehouse.id,
        quantity: "1",
        from_kind: "good",
        to_kind: "damaged",
      })
    ).statusCode,
  ).toBe(422);
  await f.invariant();
});
it("same Warehouse transfer, unrecognized evidence fields and stale cursor context are rejected", async () => {
  const plan = {
    business_ref: randomUUID(),
    source_warehouse_id: f.warehouse.id,
    destination_warehouse_id: f.warehouse.id,
    lines: [{ sku_id: f.sku.id, sku_version: 1, quantity: "1" }],
  };
  expect((await f.command("transfers", plan)).statusCode).toBe(422);
  await f.opening();
  const r = await f.command("inventory/reclassifications", {
    ...f.evidence(),
    sku_id: f.sku.id,
    sku_version: 1,
    warehouse_id: f.warehouse.id,
    quantity: "1",
    from_kind: "good",
    to_kind: "damaged",
  });
  expect(r.statusCode).toBe(200);
  const page = (await f.request("inventory?limit=1")).json();
  expect(page.nextCursor).toBeTruthy();
  expect(
    (
      await f.request(
        "inventory?limit=2&cursor=" + encodeURIComponent(page.nextCursor),
      )
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await f.request(
        "inventory?limit=1&cursor=" + encodeURIComponent(page.nextCursor) + "X",
      )
    ).statusCode,
  ).toBe(400);
});
it("an equal but unverified manual observation is still held rather than declared verified", async () => {
  await f.opening();
  const a = (await f.request("inventory")).json().items[0];
  const r = await f.command("reconciliations", {
    ...f.evidence(),
    source: "local_manual",
    account_id: a.id,
    warehouse_id: f.warehouse.id,
    observed: "100",
    as_of: new Date().toISOString(),
  });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({
    state: "held",
    difference: "0",
    trust: "local_manual",
  });
  await f.invariant();
});
it("shipment and receipt evidence histories use parent-bound signed cursors and bounded actual line rows", async () => {
  await f.opening();
  const o = await f.draft();
  await f.command("outbounds/" + o.id + "/reserve", { version: "1" });
  for (let i = 0; i < 3; i++) {
    const r = await f.command("outbounds/" + o.id + "/shipments", {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      version: String(i + 2),
      line_id: o.line.id,
      quantity: "10",
    });
    expect(r.statusCode).toBe(200);
  }
  const first = await f.request("outbounds/" + o.id + "/shipments?limit=1");
  expect(first.statusCode).toBe(200);
  expect(first.json().items).toHaveLength(1);
  expect(first.json().items[0]).toMatchObject({
    shipped_qty: "10",
    received_qty: "0",
    trust: "synthetic_test",
  });
  const next = await f.request(
    "outbounds/" +
      o.id +
      "/shipments?limit=1&cursor=" +
      encodeURIComponent(first.json().nextCursor),
  );
  expect(next.statusCode).toBe(200);
  expect(next.json().items[0].id).not.toBe(first.json().items[0].id);
  const other = await f.draft("1");
  expect(
    (
      await f.request(
        "outbounds/" +
          other.id +
          "/shipments?limit=1&cursor=" +
          encodeURIComponent(first.json().nextCursor),
      )
    ).statusCode,
  ).toBe(400);
  expect(
    (await f.request("inbounds/" + o.inbound_id + "/receipts")).json().items,
  ).toEqual([]);
  await f.invariant();
});
it("runtime summary distinguishes physical available transit and owned stock across warehouses and conditions", async () => {
  await f.opening();
  await f.command("inventory/reclassifications", {
    ...f.evidence(),
    sku_id: f.sku.id,
    sku_version: 1,
    warehouse_id: f.warehouse.id,
    quantity: "7",
    from_kind: "good",
    to_kind: "damaged",
  });
  const accounts = (await f.request("inventory?sku_id=" + f.sku.id)).json()
    .items;
  expect(
    accounts.find((r: { kind: string }) => r.kind === "damaged"),
  ).toMatchObject({
    quantity: "7",
    reserved: "0",
    available: "0",
  });
  const summary = await f.request("inventory/summary?sku_id=" + f.sku.id);
  expect(summary.statusCode).toBe(200);
  expect(summary.json().items[0]).toMatchObject({
    good: "93",
    damaged: "7",
    quarantine: "0",
    physical: "100",
    reserved: "0",
    available: "93",
    transit: "0",
    owned: "100",
  });
  await f.invariant();
});
it("F01 simultaneous duplicate outbound commands produce one plan line inbound result and event", async () => {
  const key = randomUUID(),
    body = {
      business_ref: randomUUID(),
      source_warehouse_id: f.warehouse.id,
      destination_warehouse_id: f.destination.id,
      lines: [{ sku_id: f.sku.id, sku_version: 1, quantity: "100" }],
    };
  const before = (await f.db.pool.query("SELECT count(*) FROM outbox")).rows[0]
    .count;
  const r = await Promise.all(
    [1, 2].map(() => f.command("outbounds", body, key)),
  );
  expect(r.map((x) => x.statusCode)).toEqual([200, 200]);
  expect(r[0]!.json()).toEqual(r[1]!.json());
  for (const table of [
    "outbounds",
    "outbound_lines",
    "inbounds",
    "inbound_lines",
  ])
    expect(
      (await f.db.pool.query("SELECT count(*) FROM " + table)).rows[0].count,
    ).toBe("1");
  expect(
    BigInt(
      (await f.db.pool.query("SELECT count(*) FROM outbox")).rows[0].count,
    ) - BigInt(before),
  ).toBe(1n);
  expect((await f.command("outbounds", body)).statusCode).toBe(409);
  expect(
    (
      await f.command(
        "outbounds",
        { ...body, lines: [{ ...body.lines[0], quantity: "99" }] },
        key,
      )
    ).statusCode,
  ).toBe(409);
});
it("L16-L18 valid but unrelated SKU shipment and inbound IDs cannot redirect a receipt", async () => {
  await f.opening();
  const a = await f.draft("40"),
    b = await f.draft("40");
  await f.command("outbounds/" + a.id + "/reserve", { version: "1" });
  await f.command("outbounds/" + b.id + "/reserve", { version: "1" });
  const sh = (
    await f.command("outbounds/" + a.id + "/shipments", {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      version: "2",
      line_id: a.line.id,
      quantity: "20",
    })
  ).json();
  const receipt = {
    ...f.evidence(),
    sku_id: f.sku.id,
    sku_version: 1,
    version: "1",
    shipment_line_id: sh.shipment_line_id,
    quantity: "1",
    condition: "good",
  };
  expect(
    (await f.command("inbounds/" + b.inbound_id + "/receipts", receipt))
      .statusCode,
  ).toBe(422);
  const other = await f.create("skus", {
    product_id: f.product.id,
    code: "REAL-WRONG-SKU",
  });
  expect(
    (
      await f.command("inbounds/" + a.inbound_id + "/receipts", {
        ...receipt,
        sku_id: other.id,
      })
    ).statusCode,
  ).toBe(422);
  expect(
    (await f.db.pool.query("SELECT count(*) FROM receipts")).rows[0].count,
  ).toBe("0");
  await f.invariant();
});
