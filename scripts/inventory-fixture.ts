/** Historical synthetic fixture import only. No public/development/operational database is accepted. */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Database } from "@wms/db";
import { schemaName, testDatabaseUrl } from "@wms/db";
import { seedCatalog } from "./catalog-fixture.js";
import {
  InventoryService,
  inventoryHash,
} from "../apps/api/src/inventory/service.js";
import { AuthService } from "../apps/api/src/auth/service.js";
import type { Context, Session } from "../apps/api/src/auth/service.js";
export interface InventoryScenario {
  id: string;
  sku: string;
  status: string;
  good: Record<string, number>;
  reserved: Record<string, number>;
  expected_available: Record<string, number>;
  in_transit: number;
}
const originalQuantity = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("INVALID_SYNTHETIC_QUANTITY");
  return BigInt(value);
};
export async function seedInventory(
  db: Database,
  schema: string,
  actor: string,
  key: Buffer,
  count = 60,
  ctx?: Context,
) {
  testDatabaseUrl(process.env.TEST_DATABASE_URL);
  if (!schemaName(schema).startsWith("wms_test_"))
    throw new Error("TEST_SCHEMA_REQUIRED");
  if (
    (await db.pool.query("SELECT current_schema() AS name")).rows[0].name !==
    schema
  )
    throw new Error("TEST_SCHEMA_MISMATCH");
  const source = await seedCatalog(db, schema, actor, count),
    scenarios = source.skus as unknown as InventoryScenario[];
  const warehouses = (
    await db.pool.query(
      "SELECT id FROM warehouses WHERE code LIKE 'FIXTURE-%' ORDER BY code",
    )
  ).rows.map((r) => r.id as string);
  const auth = new AuthService(db.pool, key, "http://127.0.0.1:5173"),
    service = new InventoryService(auth, key),
    session = { user_id: actor } as Session;
  async function evidence(
    c: PoolClient,
    sku: string,
    w: string,
    q: bigint,
    operation: string,
  ) {
    const id = randomUUID(),
      event = randomUUID(),
      b = {
        source: "synthetic" as const,
        source_event_id: event,
        evidence_ref: event,
        occurred_at: new Date().toISOString(),
        reason: "Historical synthetic SKU fixture " + operation,
      };
    await c.query(
      "INSERT INTO inventory_evidence(id,source,source_event_id,operation,scope,sku_id,quantity,reference,trust,actor_id,payload_hash,occurred_at) VALUES($1,'synthetic',$2,$3,$4,$5,$6,$2,'synthetic_test',$7,$8,$9)",
      [
        id,
        event,
        operation,
        w,
        sku,
        q.toString(),
        actor,
        inventoryHash({ b, quantity: q.toString() }),
        b.occurred_at,
      ],
    );
    return { id, b };
  }
  async function post(
    c: PoolClient,
    sku: string,
    w: string,
    q: bigint,
    operation: string,
    from: string,
    to: string,
    reference?: string,
  ) {
    const ev = await evidence(c, sku, w, q, operation);
    return service.postInventoryTransaction(
      c,
      { ip: "synthetic", requestId: ev.b.source_event_id },
      session,
      ev.b,
      ev.b.source_event_id,
      operation,
      w,
      ev.id,
      reference ?? ev.id,
      [
        { account: from, sku, qty: -q },
        { account: to, sku, qty: q },
      ],
    );
  }
  for (const [index, row] of scenarios.entries())
    await auth.tx(async (c) => {
      if (ctx) {
        const current = await auth.readSession(c, ctx);
        if (current.user_id !== actor)
          throw new Error("SYNTHETIC_ACTOR_MISMATCH");
        await service.access(c, current, "inventory.adjust", warehouses);
      }
      const batch = randomUUID(),
        boundary = await service.account(c, row.id, null, "external_boundary");
      for (const [position, bucket] of ["external", "fba", "rsl"].entries()) {
        const w = warehouses[position]!,
          good = originalQuantity(row.good[bucket]!),
          reserved = originalQuantity(row.reserved[bucket]!),
          transit =
            bucket === "external" ? originalQuantity(row.in_transit) : 0n,
          supplement = index === 0 && bucket === "external" ? 5n : 0n;
        if (
          reserved > good ||
          originalQuantity(row.expected_available[bucket]!) !== good - reserved
        )
          throw new Error("FIXTURE_EXPECTED_AVAILABLE_MISMATCH");
        const account = await service.account(c, row.id, w, "good"),
          opening = good + transit + supplement;
        if (opening > 0n)
          await post(c, row.id, w, opening, "opening", boundary, account);
        // Zero stock has an explicit account and synthetic count observation, never a forbidden zero Entry.
        else {
          const run = randomUUID();
          await c.query(
            "INSERT INTO reconciliation_runs(id,source,as_of,status,actor_id) VALUES($1,'synthetic',now(),'matched',$2)",
            [run, actor],
          );
          await c.query(
            "INSERT INTO reconciliation_items(id,run_id,account_id,expected,observed,difference,evidence_ref) VALUES($1,$2,$3,0,0,0,$4)",
            [
              randomUUID(),
              run,
              account,
              "synthetic-zero-" + row.sku + "-" + bucket,
            ],
          );
        }
        if (supplement) {
          for (const [kind, q] of [
            ["damaged", 2n],
            ["quarantine", 3n],
          ] as const) {
            const target = await service.account(c, row.id, w, kind);
            await post(c, row.id, w, q, "reclassify", account, target);
          }
        }
        const requested = reserved + transit;
        if (requested === 0n) continue;
        const destination = warehouses[position === 1 ? 2 : 1]!,
          outbound = randomUUID(),
          line = randomUUID(),
          inbound = randomUUID();
        await c.query(
          "INSERT INTO outbounds(id,business_ref,source_warehouse_id,destination_warehouse_id,state,created_by) VALUES($1,$2,$3,$4,'reserved',$5)",
          [
            outbound,
            "synthetic-fixture-" + row.sku + "-" + bucket,
            w,
            destination,
            actor,
          ],
        );
        await c.query(
          "INSERT INTO outbound_lines(id,outbound_id,sku_id,requested_qty) VALUES($1,$2,$3,$4)",
          [line, outbound, row.id, requested.toString()],
        );
        await c.query(
          "INSERT INTO inbounds(id,outbound_id,destination_warehouse_id) VALUES($1,$2,$3)",
          [inbound, outbound, destination],
        );
        await c.query(
          "INSERT INTO inbound_lines(id,inbound_id,outbound_line_id,sku_id,expected_qty) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), inbound, line, row.id, requested.toString()],
        );
        await c.query(
          "INSERT INTO transfers(id,outbound_id,inbound_id) VALUES($1,$2,$3)",
          [randomUUID(), outbound, inbound],
        );
        const reservation = randomUUID();
        await c.query(
          "INSERT INTO reservations(id,outbound_line_id,account_id,quantity,expires_at) VALUES($1,$2,$3,$4,now()+interval '24 hours')",
          [reservation, line, account, requested.toString()],
        );
        if (transit > 0n) {
          const ev = await evidence(c, row.id, w, transit, "ship"),
            shipment = randomUUID();
          await c.query(
            "INSERT INTO shipments(id,outbound_id,evidence_id) VALUES($1,$2,$3)",
            [shipment, outbound, ev.id],
          );
          await c.query(
            "INSERT INTO shipment_lines(id,shipment_id,outbound_line_id,sku_id,shipped_qty) VALUES($1,$2,$3,$4,$5)",
            [randomUUID(), shipment, line, row.id, transit.toString()],
          );
          const transitAccount = await service.account(
            c,
            row.id,
            w,
            "transit",
            shipment,
          );
          await service.accounts(c, [account, transitAccount]);
          await c.query(
            "UPDATE reservations SET consumed=$1,status=$2,version=version+1 WHERE id=$3",
            [transit.toString(), reserved ? "active" : "consumed", reservation],
          );
          await service.postInventoryTransaction(
            c,
            { ip: "synthetic", requestId: ev.b.source_event_id },
            session,
            ev.b,
            ev.b.source_event_id,
            "ship",
            w,
            ev.id,
            shipment,
            [
              { account, sku: row.id, qty: -transit },
              { account: transitAccount, sku: row.id, qty: transit },
            ],
          );
          await c.query(
            "UPDATE outbound_lines SET shipped_qty=$1 WHERE id=$2",
            [transit.toString(), line],
          );
          await c.query(
            "UPDATE outbounds SET state=$1,version=version+1 WHERE id=$2",
            [reserved ? "partially_shipped" : "shipped", outbound],
          );
        }
      }
      const result = {
        id: row.id,
        synthetic: true,
        fixtureSku: row.sku,
        conditionSupplement: index === 0 ? "5" : "0",
      };
      await service.event(
        c,
        { ip: "synthetic", requestId: batch },
        session,
        row.id,
        "synthetic-fixture-import",
        result,
      );
      await c.query(
        "INSERT INTO command_results(actor_id,key,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5)",
        [
          actor,
          batch,
          "inventory.synthetic-fixture-import",
          inventoryHash(row),
          JSON.stringify(result),
        ],
      );
    });
  return { source, scenarios, warehouses };
}
