import { randomUUID } from "node:crypto";
import { catalogFixture } from "./catalog-helper";
export async function inventoryFixture() {
  const f = await catalogFixture();
  const sku = await f.create("skus", {
    product_id: f.product.id,
    code: "LEDGER-SYNTHETIC",
  });
  const destination = await f.create("warehouses", {
    code: "SYNTHETIC-B",
    name: "合成倉庫B",
    type: "internal",
  });
  const evidence = () => ({
    source: "synthetic" as const,
    source_event_id: randomUUID(),
    evidence_ref: randomUUID(),
    reason: "Synthetic inventory test",
    occurred_at: new Date().toISOString(),
  });
  async function command(
    path: string,
    body: unknown,
    key = randomUUID(),
    method = "POST",
  ) {
    return f.request(path, body, method, { "idempotency-key": key });
  }
  async function opening(q = "100") {
    const r = await command("inventory/openings", {
      ...evidence(),
      sku_id: sku.id,
      sku_version: 1,
      warehouse_id: f.warehouse.id,
      quantity: q,
    });
    if (r.statusCode !== 200)
      throw new Error("OPENING_" + r.statusCode + "_" + r.body);
    return r.json();
  }
  async function draft(q = "100", kind = "outbounds") {
    const r = await command(kind, {
      business_ref: randomUUID(),
      source_warehouse_id: f.warehouse.id,
      destination_warehouse_id: destination.id,
      lines: [{ sku_id: sku.id, sku_version: 1, quantity: q }],
    });
    if (r.statusCode !== 200)
      throw new Error("DRAFT_" + r.statusCode + "_" + r.body);
    const d = r.json();
    const detail = await f.request("outbounds/" + d.id);
    return { ...d, line: detail.json().lines[0] };
  }
  async function invariant() {
    const r = await f.db.pool.query(
      `SELECT a.id FROM inventory_accounts a JOIN inventory_balances b ON b.account_id=a.id WHERE b.quantity<>(SELECT coalesce(sum(quantity),0) FROM inventory_entries e WHERE e.account_id=a.id) OR b.reserved<>(SELECT coalesce(sum(quantity-consumed-released),0) FROM reservations r WHERE r.account_id=a.id) OR(a.kind<>'external_boundary' AND b.quantity<0) OR(a.kind='good' AND b.quantity<b.reserved)`,
    );
    if (r.rowCount) throw new Error("INVARIANT_FAILURE");
    const sums = await f.db.pool.query(
      "SELECT transaction_id,sku_id FROM inventory_entries GROUP BY transaction_id,sku_id HAVING sum(quantity)<>0",
    );
    if (sums.rowCount) throw new Error("UNBALANCED");
  }
  return {
    ...f,
    sku,
    destination,
    evidence,
    command,
    opening,
    draft,
    invariant,
  };
}
