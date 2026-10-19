import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { PoolClient } from "pg";
import {
  canonicalPayload,
  balanced,
  reservationRemaining,
  canReleaseReservation,
  quantity,
  reclassification,
  retryInventoryTransaction,
} from "@wms/domain";
import { AuthService, AuthError } from "../auth/service.js";
import type { Context, Session } from "../auth/service.js";
import { allowed, recentReauth } from "../auth/policy.js";
import type { Permission } from "../auth/policy.js";
import { CatalogError } from "../catalog/service.js";
export const inventoryHash = (v: unknown) =>
  createHash("sha256").update(canonicalPayload(v)).digest("hex");
export interface EvidenceInput {
  source: "synthetic" | "local_manual" | "external";
  source_event_id: string;
  evidence_ref: string;
  occurred_at: string;
  reason: string;
}
export interface InventoryCommand extends EvidenceInput {
  sku_id?: string;
  sku_version?: number;
  warehouse_id?: string;
  location_id?: string;
  quantity?: string;
  source_warehouse_id?: string;
  destination_warehouse_id?: string;
  business_ref?: string;
  lines?: { sku_id: string; sku_version: number; quantity: string }[];
  version?: string;
  line_id?: string;
  shipment_line_id?: string;
  condition?: string;
  from_kind?: string;
  to_kind?: string;
  transaction_id?: string;
  account_id?: string;
  observed?: string;
  as_of?: string;
}
export interface InventoryQuery {
  limit?: string;
  cursor?: string;
  warehouse_id?: string;
  sku_id?: string;
  q?: string;
  state?: string;
}
const fail = (status = 409): never => {
  throw new CatalogError(
    status,
    status === 409
      ? "CONFLICT"
      : status === 404
        ? "NOT_FOUND"
        : status === 400
          ? "INVALID_INPUT"
          : status === 403
            ? "FORBIDDEN"
            : "INVALID_RELATION",
  );
};
export class InventoryService {
  constructor(
    public auth: AuthService,
    private key: Buffer,
    private allowSynthetic = false,
  ) {
    this.key = createHmac("sha256", key)
      .update("wms/inventory-cursor/v1")
      .digest();
  }
  async run<T>(
    ctx: Context,
    write: boolean,
    fn: (c: PoolClient, s: Session) => Promise<T>,
  ): Promise<T> {
    if (write) await this.auth.rate("mutation-ip", ctx.ip, 100, 60);
    for (let attempt = 0; ; attempt++)
      try {
        return await this.auth.tx(async (c) => {
          const s = await this.auth.readSession(c, ctx);
          if (write) this.auth.csrf(ctx, s);
          return fn(c, s);
        });
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (retryInventoryTransaction(code, attempt)) continue;
        if (code === "23505") throw new CatalogError(409, "CONFLICT");
        if (["23503", "23514", "22003"].includes(code ?? ""))
          throw new CatalogError(422);
        throw e;
      }
  }
  async access(
    c: PoolClient,
    s: Session,
    permission: Permission,
    ids: string[],
    recent = false,
  ) {
    const grants = await this.auth.grants(c, s.user_id!);
    const known = (
      await c.query(
        "SELECT id FROM warehouses WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
        [ids],
      )
    ).rows.map((r) => r.id as string);
    if (ids.some((id) => !allowed(grants, permission, id, known)))
      throw new AuthError("FORBIDDEN", 403);
    if (recent && !recentReauth(s.reauthenticated_at))
      throw new AuthError("REAUTH_REQUIRED", 403);
  }
  async active(
    c: PoolClient,
    sku: string,
    warehouses: string[],
    version?: number,
  ) {
    const r = (
      await c.query(
        "SELECT s.status,s.version,p.status AS product_status FROM skus s JOIN products p ON p.id=s.product_id WHERE s.id=$1 FOR SHARE OF s,p",
        [sku],
      )
    ).rows[0];
    if (!r) fail(404);
    if (r.status !== "active" || r.product_status !== "active") fail(422);
    if (version !== undefined && version !== r.version) fail();
    const w = await c.query(
      "SELECT id FROM warehouses WHERE id=ANY($1::uuid[]) AND status='active' ORDER BY id FOR SHARE",
      [warehouses],
    );
    if (w.rowCount !== new Set(warehouses).size) fail(422);
  }
  async account(
    c: PoolClient,
    sku: string,
    warehouse: string | null,
    kind: string,
    shipment: string | null = null,
    location: string | null = null,
  ): Promise<string> {
    if (
      location &&
      !(
        await c.query(
          "SELECT id FROM locations WHERE id=$1 AND warehouse_id=$2 AND status='active' FOR SHARE",
          [location, warehouse],
        )
      ).rowCount
    )
      fail(422);
    const id = randomUUID();
    await c.query(
      "INSERT INTO inventory_accounts(id,sku_id,warehouse_id,location_id,kind,shipment_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(sku_id,warehouse_id,location_id,kind,shipment_id) DO NOTHING",
      [id, sku, warehouse, location, kind, shipment],
    );
    return (
      await c.query(
        "SELECT id FROM inventory_accounts WHERE sku_id=$1 AND warehouse_id IS NOT DISTINCT FROM $2 AND location_id IS NOT DISTINCT FROM $3 AND kind=$4 AND shipment_id IS NOT DISTINCT FROM $5",
        [sku, warehouse, location, kind, shipment],
      )
    ).rows[0].id;
  }
  async accounts(c: PoolClient, ids: string[]) {
    return (
      await c.query(
        "SELECT b.*,a.kind,a.sku_id,a.warehouse_id FROM inventory_balances b JOIN inventory_accounts a ON a.id=b.account_id WHERE b.account_id=ANY($1::uuid[]) ORDER BY b.account_id FOR UPDATE OF b",
        [ids],
      )
    ).rows;
  }
  async synthetic(c: PoolClient, source: EvidenceInput["source"]) {
    if (source !== "synthetic") return false;
    const target = (
      await c.query(
        "SELECT current_schema() AS name,current_database() AS database",
      )
    ).rows[0] as { name: string; database: string };
    if (
      !this.allowSynthetic &&
      !(
        target.database === "wms_test" &&
        /^wms_test_[a-f0-9]{32}$/.test(target.name)
      )
    )
      throw new AuthError("FORBIDDEN", 403);
    return true;
  }
  async evidence(
    c: PoolClient,
    s: Session,
    b: InventoryCommand,
    operation: string,
    scope: string,
    sku: string,
    qty: string,
    payloadHash: string,
  ) {
    const synthetic = await this.synthetic(c, b.source);
    const trust = synthetic
      ? "synthetic_test"
      : b.source === "local_manual"
        ? "local_manual"
        : "external_unverified";
    const old = (
      await c.query(
        "SELECT payload_hash FROM inventory_evidence WHERE source=$1 AND scope=$2 AND operation=$3 AND (source_event_id=$4 OR reference=$5)",
        [b.source, scope, operation, b.source_event_id, b.evidence_ref],
      )
    ).rows[0];
    if (old) throw new CatalogError(409, "CONFLICT");
    const id = randomUUID();
    await c.query(
      "INSERT INTO inventory_evidence(id,source,source_event_id,operation,scope,sku_id,quantity,reference,trust,actor_id,payload_hash,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [
        id,
        b.source,
        b.source_event_id,
        operation,
        scope,
        sku,
        qty,
        b.evidence_ref,
        trust,
        s.user_id,
        payloadHash,
        b.occurred_at,
      ],
    );
    return { id, synthetic, trust };
  }
  async postInventoryTransaction(
    c: PoolClient,
    ctx: Context,
    s: Session,
    b: InventoryCommand,
    key: string,
    operation: string,
    scope: string,
    evidence: string,
    reference: string,
    entries: { account: string; sku: string; qty: bigint }[],
    reverses: string | null = null,
  ) {
    if (!balanced(entries.map((e) => ({ sku: e.sku, quantity: e.qty }))))
      fail(422);
    const id = randomUUID();
    await c.query(
      "INSERT INTO inventory_transactions(id,movement_type,reason,reference_type,reference_id,actor_id,source_system,source_event_id,scope,idempotency_key,payload_hash,evidence_id,reverses_id,request_id,occurred_at) VALUES($1,$2,$3,$2,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING recorded_at",
      [
        id,
        operation,
        b.reason,
        reference,
        s.user_id,
        b.source,
        b.source_event_id,
        scope,
        key,
        inventoryHash(b),
        evidence,
        reverses,
        ctx.requestId,
        b.occurred_at,
      ],
    );
    const locked = await this.accounts(
      c,
      entries.map((e) => e.account),
    );
    for (const e of entries) {
      const row = locked.find((r) => r.account_id === e.account)!;
      if (
        row.kind !== "external_boundary" &&
        BigInt(row.quantity) + e.qty < BigInt(row.reserved)
      )
        fail(422);
    }
    for (const [i, e] of entries.entries())
      await c.query(
        "INSERT INTO inventory_entries(id,transaction_id,sku_id,account_id,quantity,line_no,recorded_at) VALUES($1,$2,$3,$4,$5,$6,(SELECT recorded_at FROM inventory_transactions WHERE id=$2))",
        [randomUUID(), id, e.sku, e.account, e.qty.toString(), i + 1],
      );
    return id;
  }
  async event(
    c: PoolClient,
    ctx: Context,
    s: Session,
    id: string,
    operation: string,
    result: unknown,
    version = "1",
  ) {
    await this.auth.audit(
      c,
      s.user_id!,
      "inventory." + operation,
      id,
      "SUCCESS",
      ctx.requestId,
      undefined,
      canonicalPayload(result),
    );
    await c.query(
      "INSERT INTO outbox(id,action_key,aggregate_id,aggregate_version,topic,payload,payload_hash,correlation_id,causation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        randomUUID(),
        randomUUID(),
        id,
        version,
        "inventory." + operation,
        JSON.stringify(result),
        inventoryHash(result),
        ctx.requestId,
        ctx.requestId,
      ],
    );
  }
  async command(
    ctx: Context,
    operation: string,
    b: InventoryCommand,
    key: string,
    id?: string,
  ) {
    if (!/^[!-~]{8,128}$/.test(key)) fail(400);
    for (const q of [
      b.quantity,
      b.observed,
      ...(b.lines?.map((l) => l.quantity) ?? []),
    ])
      if (q !== undefined)
        try {
          quantity(q, q !== b.observed);
        } catch {
          fail(400);
        }
    return this.run(ctx, true, async (c, s) => {
      // Per actor/key advisory lock, never a global posting mutex. Security mutations lock the user row.
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,74004))",
        [s.user_id + ":" + key],
      );
      let outbound: Record<string, string> | undefined;
      if (
        id &&
        ["reserve", "release", "cancel", "ship", "edit"].includes(operation)
      )
        outbound = (
          await c.query("SELECT * FROM outbounds WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
      let inbound: Record<string, string> | undefined;
      if (id && operation === "receive") {
        inbound = (await c.query("SELECT * FROM inbounds WHERE id=$1", [id]))
          .rows[0];
        if (!inbound) fail(404);
        outbound = (
          await c.query("SELECT * FROM outbounds WHERE id=$1 FOR UPDATE", [
            inbound!.outbound_id,
          ])
        ).rows[0];
        await c.query("SELECT id FROM inbounds WHERE id=$1 FOR UPDATE", [id]);
      }
      if (
        id &&
        ["reserve", "release", "cancel", "ship", "edit", "receive"].includes(
          operation,
        ) &&
        !outbound
      )
        fail(404);
      const warehouses = outbound
        ? [outbound.source_warehouse_id!, outbound.destination_warehouse_id!]
        : b.source_warehouse_id
          ? [b.source_warehouse_id, b.destination_warehouse_id!]
          : b.warehouse_id
            ? [b.warehouse_id]
            : [];
      const permission: Permission = [
        "draft",
        "transfer",
        "reserve",
        "release",
        "cancel",
        "ship",
        "edit",
        "receive",
      ].includes(operation)
        ? "outbound.create"
        : "inventory.adjust";
      if (!warehouses.length && operation === "reverse") {
        const a = (
          await c.query(
            "SELECT DISTINCT a.warehouse_id FROM inventory_entries e JOIN inventory_accounts a ON a.id=e.account_id WHERE e.transaction_id=$1 AND a.warehouse_id IS NOT NULL",
            [b.transaction_id],
          )
        ).rows;
        warehouses.push(...a.map((r) => r.warehouse_id));
      }
      if (!warehouses.length) fail(400);
      await this.access(
        c,
        s,
        permission,
        warehouses,
        ["opening", "reclassify", "reverse", "adjustment"].includes(operation),
      );
      const payloadHash = inventoryHash({ operation, id: id ?? null, body: b });
      const old = (
        await c.query(
          "SELECT * FROM command_results WHERE actor_id=$1 AND key=$2",
          [s.user_id, key],
        )
      ).rows[0];
      if (old) {
        if (
          old.operation !== "inventory." + operation ||
          old.payload_hash !== payloadHash
        )
          throw new CatalogError(409, "CONFLICT");
        return old.result;
      }
      if (
        outbound &&
        b.version !== (inbound ? inbound.version : outbound.version)
      )
        throw new CatalogError(409, "CONFLICT");
      for (const l of [
        ...(b.lines ?? []),
        ...(b.sku_id ? [{ sku_id: b.sku_id, sku_version: b.sku_version }] : []),
      ].sort((a, b) => a.sku_id.localeCompare(b.sku_id)))
        await this.active(c, l.sku_id, warehouses, l.sku_version);
      let result: Record<string, unknown>;
      if (operation === "draft" || operation === "transfer") {
        if (
          b.source_warehouse_id === b.destination_warehouse_id ||
          !b.lines?.length
        )
          fail(422);
        const oid = randomUUID(),
          iid = randomUUID();
        await c.query(
          "INSERT INTO outbounds(id,business_ref,source_warehouse_id,destination_warehouse_id,created_by) VALUES($1,$2,$3,$4,$5)",
          [
            oid,
            b.business_ref,
            b.source_warehouse_id,
            b.destination_warehouse_id,
            s.user_id,
          ],
        );
        await c.query(
          "INSERT INTO inbounds(id,outbound_id,destination_warehouse_id) VALUES($1,$2,$3)",
          [iid, oid, b.destination_warehouse_id],
        );
        for (const l of b.lines!) {
          const lid = randomUUID();
          await c.query(
            "INSERT INTO outbound_lines(id,outbound_id,sku_id,requested_qty) VALUES($1,$2,$3,$4)",
            [lid, oid, l.sku_id, l.quantity],
          );
          await c.query(
            "INSERT INTO inbound_lines(id,inbound_id,outbound_line_id,sku_id,expected_qty) VALUES($1,$2,$3,$4,$5)",
            [randomUUID(), iid, lid, l.sku_id, l.quantity],
          );
        }
        const tid = operation === "transfer" ? randomUUID() : null;
        if (tid)
          await c.query(
            "INSERT INTO transfers(id,outbound_id,inbound_id) VALUES($1,$2,$3)",
            [tid, oid, iid],
          );
        result = {
          id: oid,
          inbound_id: iid,
          transfer_id: tid,
          state: "draft",
          version: "1",
        };
      } else if (operation === "reserve") {
        if (outbound!.state !== "draft") fail();
        const lines = (
          await c.query(
            "SELECT * FROM outbound_lines WHERE outbound_id=$1 ORDER BY sku_id",
            [id],
          )
        ).rows;
        const accounts: string[] = [];
        for (const l of lines) {
          await this.active(c, l.sku_id, warehouses);
          accounts.push(
            await this.account(c, l.sku_id, warehouses[0]!, "good"),
          );
        }
        const balances = await this.accounts(c, accounts);
        for (const [i, l] of lines.entries()) {
          const a = balances.find((r) => r.account_id === accounts[i])!;
          if (BigInt(a.quantity) - BigInt(a.reserved) < BigInt(l.requested_qty))
            fail(422);
          await c.query(
            "INSERT INTO reservations(id,outbound_line_id,account_id,quantity,expires_at) VALUES($1,$2,$3,$4,now()+interval '24 hours')",
            [randomUUID(), l.id, accounts[i], l.requested_qty],
          );
        }
        result = await this.advance(c, id!, "reserved");
      } else if (["release", "cancel"].includes(operation)) {
        if (!canReleaseReservation(outbound!.state!)) {
          if (
            operation !== "cancel" ||
            ["cancelled", "received", "reconciled"].includes(outbound!.state!)
          )
            fail();
          result = {
            ...(await this.advance(c, id!, "cancellation_requested")),
            release_allowed: false,
            reason: "external_confirmation_required",
          };
        } else {
          const reservations = (
            await c.query(
              "SELECT r.* FROM reservations r JOIN outbound_lines l ON l.id=r.outbound_line_id WHERE l.outbound_id=$1 ORDER BY r.account_id FOR UPDATE OF r",
              [id],
            )
          ).rows;
          await this.accounts(
            c,
            reservations.map((r) => r.account_id),
          );
          await c.query(
            "UPDATE reservations r SET released=quantity-consumed,status='released',version=version+1 FROM outbound_lines l WHERE l.id=r.outbound_line_id AND l.outbound_id=$1",
            [id],
          );
          await c.query(
            "UPDATE outbound_lines SET cancelled_qty=requested_qty-shipped_qty WHERE outbound_id=$1",
            [id],
          );
          result = await this.advance(c, id!, "cancelled");
          await c.query(
            "UPDATE inbounds SET state='cancelled',version=version+1 WHERE outbound_id=$1",
            [id],
          );
        }
      } else if (operation === "edit") {
        if (outbound!.state !== "draft" || !b.lines?.length) fail();
        for (const l of b.lines!) {
          const r = await c.query(
            "UPDATE outbound_lines SET requested_qty=$1 WHERE outbound_id=$2 AND sku_id=$3",
            [l.quantity, id, l.sku_id],
          );
          if (!r.rowCount) fail(422);
          await c.query(
            "UPDATE inbound_lines SET expected_qty=$1 WHERE outbound_line_id IN(SELECT id FROM outbound_lines WHERE outbound_id=$2 AND sku_id=$3)",
            [l.quantity, id, l.sku_id],
          );
        }
        result = await this.advance(c, id!, "draft");
      } else if (operation === "opening" || operation === "reclassify") {
        const q = quantity(b.quantity!),
          sku = b.sku_id!,
          w = b.warehouse_id!;
        const ev = await this.evidence(
          c,
          s,
          b,
          operation,
          w,
          sku,
          b.quantity!,
          payloadHash,
        );
        if (!ev.synthetic)
          result = { id: ev.id, state: "held", trust: ev.trust };
        else {
          if (operation === "opening") {
            const a = await this.account(
              c,
              sku,
              w,
              "good",
              null,
              b.location_id ?? null,
            );
            await this.accounts(c, [a]);
          }

          if (
            operation === "opening" &&
            (
              await c.query(
                "SELECT 1 FROM inventory_transactions t JOIN inventory_entries e ON e.transaction_id=t.id JOIN inventory_accounts a ON a.id=e.account_id WHERE t.movement_type='opening' AND e.sku_id=$1 AND a.warehouse_id=$2 AND a.location_id IS NOT DISTINCT FROM $3",
                [sku, w, b.location_id ?? null],
              )
            ).rowCount
          )
            fail();
          if (
            operation === "reclassify" &&
            !reclassification(b.from_kind as never, b.to_kind as never)
          )
            fail(422);
          const from = await this.account(
            c,
            sku,
            operation === "opening" ? null : w,
            operation === "opening" ? "external_boundary" : b.from_kind!,
            null,
            operation === "opening" ? null : (b.location_id ?? null),
          );
          const to = await this.account(
            c,
            sku,
            w,
            operation === "opening" ? "good" : b.to_kind!,
            null,
            b.location_id ?? null,
          );
          const tid = await this.postInventoryTransaction(
            c,
            ctx,
            s,
            b,
            key,
            operation,
            w,
            ev.id,
            ev.id,
            [
              { account: from, sku, qty: -q },
              { account: to, sku, qty: q },
            ],
          );
          result = { id: tid, state: "posted", trust: ev.trust };
        }
      } else if (operation === "ship") {
        if (
          !["reserved", "partially_shipped", "cancellation_requested"].includes(
            outbound!.state!,
          )
        )
          fail();
        const l = (
          await c.query(
            "SELECT * FROM outbound_lines WHERE id=$1 AND outbound_id=$2",
            [b.line_id, id],
          )
        ).rows[0];
        if (!l || l.sku_id !== b.sku_id) fail(422);
        await this.active(c, l.sku_id, warehouses, b.sku_version);
        const q = quantity(b.quantity!);
        const ev = await this.evidence(
          c,
          s,
          b,
          operation,
          warehouses[0]!,
          l.sku_id,
          b.quantity!,
          payloadHash,
        );
        if (
          q >
          BigInt(l.requested_qty) -
            BigInt(l.shipped_qty) -
            BigInt(l.cancelled_qty)
        )
          fail(422);
        if (!ev.synthetic) {
          const held = await this.advance(c, id!, "held");
          result = { ...held, evidence_id: ev.id, trust: ev.trust };
        } else {
          const r = (
            await c.query(
              "SELECT * FROM reservations WHERE outbound_line_id=$1",
              [l.id],
            )
          ).rows[0];
          if (
            !r ||
            reservationRemaining(
              BigInt(r.quantity),
              BigInt(r.consumed),
              BigInt(r.released),
            ) < q
          )
            fail(422);
          const shipment = randomUUID(),
            sl = randomUUID();
          await c.query(
            "INSERT INTO shipments(id,outbound_id,evidence_id) VALUES($1,$2,$3)",
            [shipment, id, ev.id],
          );
          await c.query(
            "INSERT INTO shipment_lines(id,shipment_id,outbound_line_id,sku_id,shipped_qty) VALUES($1,$2,$3,$4,$5)",
            [sl, shipment, l.id, l.sku_id, b.quantity],
          );
          const transit = await this.account(
            c,
            l.sku_id,
            warehouses[0]!,
            "transit",
            shipment,
          );
          await this.accounts(c, [r.account_id, transit]);
          await c.query(
            "UPDATE reservations SET consumed=consumed+$1,version=version+1,status=CASE WHEN consumed+released+$1=quantity THEN 'consumed' ELSE 'active' END WHERE id=$2",
            [b.quantity, r.id],
          );
          const tid = await this.postInventoryTransaction(
            c,
            ctx,
            s,
            b,
            key,
            operation,
            warehouses[0]!,
            ev.id,
            shipment,
            [
              { account: r.account_id, sku: l.sku_id, qty: -q },
              { account: transit, sku: l.sku_id, qty: q },
            ],
          );
          await c.query(
            "UPDATE outbound_lines SET shipped_qty=shipped_qty+$1 WHERE id=$2",
            [b.quantity, l.id],
          );
          const missing = (
            await c.query(
              "SELECT 1 FROM outbound_lines WHERE outbound_id=$1 AND requested_qty>shipped_qty+cancelled_qty",
              [id],
            )
          ).rowCount;
          result = {
            ...(await this.advance(
              c,
              id!,
              missing ? "partially_shipped" : "shipped",
            )),
            shipment_id: shipment,
            shipment_line_id: sl,
            transaction_id: tid,
          };
        }
      } else if (operation === "receive") {
        const l = (
          await c.query(
            "SELECT sl.* FROM shipment_lines sl JOIN shipments sh ON sh.id=sl.shipment_id WHERE sl.id=$1 AND sh.outbound_id=$2 FOR UPDATE OF sl",
            [b.shipment_line_id, outbound!.id],
          )
        ).rows[0];
        if (!l || l.sku_id !== b.sku_id) fail(422);
        await this.active(c, l.sku_id, warehouses, b.sku_version);
        const q = quantity(b.quantity!),
          ev = await this.evidence(
            c,
            s,
            b,
            operation,
            warehouses[1]!,
            l.sku_id,
            b.quantity!,
            payloadHash,
          );
        const held =
          !ev.synthetic || q > BigInt(l.shipped_qty) - BigInt(l.received_qty);
        const rid = randomUUID();
        await c.query(
          "INSERT INTO receipts(id,inbound_id,evidence_id,status) VALUES($1,$2,$3,$4)",
          [rid, id, ev.id, held ? "held" : "accepted"],
        );
        await c.query(
          "INSERT INTO receipt_lines(id,receipt_id,shipment_line_id,quantity,condition) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), rid, l.id, b.quantity, b.condition ?? "good"],
        );
        if (held) {
          await c.query(
            "UPDATE inbounds SET state='held',version=version+1 WHERE id=$1",
            [id],
          );
          result = {
            id: rid,
            state: "held",
            reason: ev.synthetic ? "over_receipt" : "unverified_evidence",
          };
        } else {
          const transit = await this.account(
              c,
              l.sku_id,
              warehouses[0]!,
              "transit",
              l.shipment_id,
            ),
            dest = await this.account(
              c,
              l.sku_id,
              warehouses[1]!,
              b.condition ?? "good",
            );
          const tid = await this.postInventoryTransaction(
            c,
            ctx,
            s,
            b,
            key,
            operation,
            warehouses[1]!,
            ev.id,
            rid,
            [
              { account: transit, sku: l.sku_id, qty: -q },
              { account: dest, sku: l.sku_id, qty: q },
            ],
          );
          await c.query(
            "UPDATE shipment_lines SET received_qty=received_qty+$1 WHERE id=$2",
            [b.quantity, l.id],
          );
          await c.query(
            "UPDATE inbound_lines SET received_qty=received_qty+$1 WHERE outbound_line_id=$2",
            [b.quantity, l.outbound_line_id],
          );
          const missing = (
            await c.query(
              "SELECT 1 FROM inbound_lines WHERE inbound_id=$1 AND received_qty<expected_qty",
              [id],
            )
          ).rowCount;
          const updated = (
            await c.query(
              "UPDATE inbounds SET state=$1,version=version+1 WHERE id=$2 RETURNING *",
              [missing ? "partially_received" : "received", id],
            )
          ).rows[0];
          result = { ...updated, receipt_id: rid, transaction_id: tid };
        }
      } else if (operation === "reverse") {
        const original = (
          await c.query("SELECT * FROM inventory_transactions WHERE id=$1", [
            b.transaction_id,
          ])
        ).rows[0];
        if (
          !original ||
          !["opening", "reclassify"].includes(original.movement_type)
        )
          fail(422);
        const rows = (
          await c.query(
            "SELECT * FROM inventory_entries WHERE transaction_id=$1 ORDER BY account_id",
            [original.id],
          )
        ).rows;
        const sku = rows[0].sku_id;
        await this.active(c, sku, warehouses);
        const ev = await this.evidence(
          c,
          s,
          b,
          operation,
          warehouses[0]!,
          sku,
          rows
            .reduce(
              (sum, r) =>
                BigInt(r.quantity) > 0n ? sum + BigInt(r.quantity) : sum,
              0n,
            )
            .toString(),
          payloadHash,
        );
        if (!ev.synthetic) result = { id: ev.id, state: "held" };
        else {
          const tid = await this.postInventoryTransaction(
            c,
            ctx,
            s,
            b,
            key,
            operation,
            warehouses[0]!,
            ev.id,
            original.id,
            rows.map((r) => ({
              account: r.account_id,
              sku: r.sku_id,
              qty: -BigInt(r.quantity),
            })),
            original.id,
          );
          result = { id: tid, state: "posted" };
        }
      } else if (operation === "reconcile" || operation === "adjustment") {
        const a = (
          await c.query(
            "SELECT a.*,b.quantity FROM inventory_accounts a JOIN inventory_balances b ON b.account_id=a.id WHERE a.id=$1 FOR SHARE OF b",
            [b.account_id],
          )
        ).rows[0];
        if (
          !a ||
          a.warehouse_id !== b.warehouse_id ||
          a.kind === "external_boundary"
        )
          fail(422);
        const asOf = new Date(b.as_of!),
          cutoff = Number.isFinite(asOf.getTime()) ? asOf : new Date(0);
        const expected = (
          await c.query(
            "SELECT coalesce(sum(quantity),0)::text AS value FROM inventory_entries WHERE account_id=$1 AND recorded_at<=$2",
            [a.id, cutoff],
          )
        ).rows[0].value;
        const difference = BigInt(b.observed!) - BigInt(expected),
          rid = randomUUID();
        const fresh = Math.abs(Date.now() - cutoff.getTime()) <= 300000;
        const synthetic = await this.synthetic(c, b.source);
        const state =
          difference === 0n && fresh && synthetic ? "matched" : "held";
        await c.query(
          "INSERT INTO reconciliation_runs(id,source,as_of,status,actor_id) VALUES($1,$2,$3,$4,$5)",
          [rid, b.source, cutoff, state, s.user_id],
        );
        await c.query(
          "INSERT INTO reconciliation_items(id,run_id,account_id,expected,observed,difference,evidence_ref) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            randomUUID(),
            rid,
            a.id,
            expected,
            b.observed,
            difference.toString(),
            b.evidence_ref,
          ],
        );
        result = {
          id: rid,
          state,
          expected,
          observed: b.observed,
          difference: difference.toString(),
          trust: synthetic
            ? "synthetic_test"
            : b.source === "local_manual"
              ? "local_manual"
              : "external_unverified",
        };
      } else fail(400);
      await this.event(
        c,
        ctx,
        s,
        result!.id as string,
        operation,
        result!,
        String(result!.version ?? "1"),
      );
      await c.query(
        "INSERT INTO command_results(actor_id,key,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5)",
        [
          s.user_id,
          key,
          "inventory." + operation,
          payloadHash,
          JSON.stringify(result!),
        ],
      );
      return result!;
    });
  }
  async advance(c: PoolClient, id: string, state: string) {
    return (
      await c.query(
        "UPDATE outbounds SET state=$1,version=version+1 WHERE id=$2 RETURNING *",
        [state, id],
      )
    ).rows[0];
  }
  async list(ctx: Context, entity: string, q: InventoryQuery, id?: string) {
    return this.run(ctx, false, async (c, s) => {
      const permission: Permission = [
        "outbounds",
        "inbounds",
        "transfers",
        "reservations",
        "shipments",
        "receipts",
      ].includes(entity)
        ? "outbound.read"
        : "inventory.read";
      const grants = await this.auth.grants(c, s.user_id!);
      const global = allowed(grants, permission);
      const scope = grants
        .filter(
          (g) =>
            g.permission === permission &&
            g.policyVersion === 1 &&
            g.scope !== "global",
        )
        .map((g) => g.scope);
      if (!global && !scope.length) throw new AuthError("FORBIDDEN", 403);
      if (q.warehouse_id) await this.access(c, s, permission, [q.warehouse_id]);
      const nested = entity === "shipments" || entity === "receipts";
      if (nested) {
        const parent = (
          await c.query(
            entity === "shipments"
              ? "SELECT source_warehouse_id,destination_warehouse_id FROM outbounds WHERE id=$1"
              : "SELECT o.source_warehouse_id,o.destination_warehouse_id FROM inbounds i JOIN outbounds o ON o.id=i.outbound_id WHERE i.id=$1",
            [id],
          )
        ).rows[0];
        if (!parent) fail(404);
        await this.access(c, s, permission, [
          parent.source_warehouse_id,
          parent.destination_warehouse_id,
        ]);
      }

      const limit = Number(q.limit ?? 25);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(400);
      const filter = inventoryHash({
        actor: s.user_id,
        grants,
        entity,
        q: Object.fromEntries(
          Object.entries(q).filter(([k]) => k !== "cursor"),
        ),
        id,
      });
      let after: string | null = null;
      if (q.cursor) {
        const [payload, signature] = q.cursor.split(".");
        const expected = createHmac("sha256", this.key)
          .update(payload ?? "")
          .digest("hex");
        if (
          !signature ||
          signature.length !== 64 ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
        )
          fail(400);
        try {
          const data = JSON.parse(
            Buffer.from(payload!, "base64url").toString(),
          );
          if (data.filter !== filter) fail(400);
          after = data.after;
        } catch {
          fail(400);
        }
      }
      const args: unknown[] = [
        global,
        scope,
        q.warehouse_id ?? null,
        q.sku_id ?? null,
        after,
        limit + 1,
        id ?? null,
        q.q ?? null,
        q.state ?? null,
      ];
      let sql: string;
      if (entity === "balances")
        sql = `SELECT a.*,b.quantity,b.reserved,(CASE WHEN a.kind='good' THEN b.quantity-b.reserved ELSE 0 END)::text AS available,b.version,b.updated_at,s.code AS sku_code FROM inventory_accounts a JOIN inventory_balances b ON b.account_id=a.id JOIN skus s ON s.id=a.sku_id WHERE a.kind<>'external_boundary' AND ($1 OR a.warehouse_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR a.warehouse_id=$3) AND ($4::uuid IS NULL OR a.sku_id=$4) AND ($5::uuid IS NULL OR a.id>$5) AND ($7::uuid IS NULL OR a.id=$7) AND ($8::text IS NULL OR strpos(lower(s.code),lower($8))>0) AND ($9::text IS NULL OR a.kind=$9) ORDER BY a.id LIMIT $6`;
      else if (entity === "summary") {
        sql = `SELECT a.sku_id::text||':'||a.warehouse_id::text AS id,a.sku_id,a.warehouse_id,s.code AS sku_code,
        coalesce(sum(b.quantity) FILTER(WHERE a.kind='good'),0)::text AS good,
        coalesce(sum(b.quantity) FILTER(WHERE a.kind='damaged'),0)::text AS damaged,
        coalesce(sum(b.quantity) FILTER(WHERE a.kind='quarantine'),0)::text AS quarantine,
        coalesce(sum(b.reserved) FILTER(WHERE a.kind='good'),0)::text AS reserved,
        coalesce(sum(b.quantity-b.reserved) FILTER(WHERE a.kind='good'),0)::text AS available,
        coalesce(sum(b.quantity) FILTER(WHERE a.kind IN('good','damaged','quarantine')),0)::text AS physical,
        coalesce(sum(b.quantity) FILTER(WHERE a.kind='transit'),0)::text AS transit,
        sum(b.quantity)::text AS owned,max(b.updated_at) AS updated_at
        FROM inventory_accounts a JOIN inventory_balances b ON b.account_id=a.id JOIN skus s ON s.id=a.sku_id
        WHERE a.kind<>'external_boundary' AND($1 OR a.warehouse_id=ANY($2::uuid[])) AND($3::uuid IS NULL OR a.warehouse_id=$3) AND($4::uuid IS NULL OR a.sku_id=$4) AND($5::text IS NULL OR a.sku_id::text||':'||a.warehouse_id::text>$5) AND($7::uuid IS NULL OR a.sku_id=$7) AND($8::text IS NULL OR strpos(lower(s.code),lower($8))>0) AND($9::text IS NULL OR s.status=$9)
        GROUP BY a.sku_id,a.warehouse_id,s.code ORDER BY a.sku_id,a.warehouse_id LIMIT $6`;
      } else if (nested) {
        const shipment = entity === "shipments";
        const from = shipment
          ? "shipment_lines line JOIN shipments event ON event.id=line.shipment_id JOIN outbounds o ON o.id=event.outbound_id"
          : "receipt_lines line JOIN receipts event ON event.id=line.receipt_id JOIN inbounds i ON i.id=event.inbound_id JOIN outbounds o ON o.id=i.outbound_id JOIN shipment_lines sl ON sl.id=line.shipment_line_id";
        const parent = shipment ? "event.outbound_id" : "event.inbound_id";
        const sku = shipment ? "line.sku_id" : "sl.sku_id";
        sql = `SELECT line.*,event.evidence_id,event.created_at,ev.source,ev.trust,ev.reference ${shipment ? "" : ",event.status,sl.sku_id"} FROM ${from} JOIN inventory_evidence ev ON ev.id=event.evidence_id WHERE ${parent}=$7 AND ($1 OR(o.source_warehouse_id=ANY($2::uuid[]) AND o.destination_warehouse_id=ANY($2::uuid[]))) AND($3::uuid IS NULL OR o.source_warehouse_id=$3 OR o.destination_warehouse_id=$3) AND($4::uuid IS NULL OR ${sku}=$4) AND($5::uuid IS NULL OR line.id>$5) AND($8::text IS NULL OR strpos(ev.reference,$8)>0) AND($9::text IS NULL OR ev.trust=$9) ORDER BY line.id LIMIT $6`;
      } else if (entity === "transactions") {
        const access = `($1 OR a.warehouse_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR a.warehouse_id=$3)`;
        const hidden = `NOT EXISTS(SELECT 1 FROM inventory_entries x JOIN inventory_accounts ax ON ax.id=x.account_id WHERE x.transaction_id=t.id AND ax.warehouse_id IS NOT NULL AND NOT($1 OR ax.warehouse_id=ANY($2::uuid[])))`;
        const filters = `($5::uuid IS NULL OR t.id>$5) AND ($7::uuid IS NULL OR t.id=$7) AND ($8::text IS NULL OR strpos(t.reason,$8)>0) AND ($9::text IS NULL OR t.movement_type=$9)`;
        sql = q.sku_id
          ? `SELECT result.* FROM (SELECT DISTINCT e.transaction_id FROM inventory_entries e JOIN inventory_accounts a ON a.id=e.account_id JOIN inventory_transactions t ON t.id=e.transaction_id WHERE e.sku_id=$4 AND ${access} AND ${hidden} AND ${filters} ORDER BY e.transaction_id LIMIT $6) page JOIN inventory_transactions result ON result.id=page.transaction_id ORDER BY result.id`
          : `SELECT t.* FROM inventory_transactions t JOIN LATERAL(SELECT 1 FROM inventory_entries e JOIN inventory_accounts a ON a.id=e.account_id WHERE e.transaction_id=t.id AND ${access} AND ($4::uuid IS NULL OR e.sku_id=$4) LIMIT 1) permitted ON true WHERE ${hidden} AND ${filters} ORDER BY t.id LIMIT $6`;
      } else if (entity === "reservations")
        sql = `SELECT r.* FROM reservations r JOIN inventory_accounts a ON a.id=r.account_id WHERE ($1 OR a.warehouse_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR a.warehouse_id=$3) AND ($4::uuid IS NULL OR a.sku_id=$4) AND ($5::uuid IS NULL OR r.id>$5) AND ($7::uuid IS NULL OR r.id=$7) AND ($8::text IS NULL OR EXISTS(SELECT 1 FROM skus s WHERE s.id=a.sku_id AND strpos(lower(s.code),lower($8))>0)) AND ($9::text IS NULL OR r.status=$9) ORDER BY r.id LIMIT $6`;
      else if (entity === "reconciliations")
        sql = `SELECT r.*,i.expected,i.observed,i.difference,i.evidence_ref FROM reconciliation_runs r JOIN reconciliation_items i ON i.run_id=r.id JOIN inventory_accounts a ON a.id=i.account_id WHERE ($1 OR a.warehouse_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR a.warehouse_id=$3) AND ($4::uuid IS NULL OR a.sku_id=$4) AND ($5::uuid IS NULL OR r.id>$5) AND ($7::uuid IS NULL OR r.id=$7) AND ($8::text IS NULL OR EXISTS(SELECT 1 FROM skus s WHERE s.id=a.sku_id AND strpos(lower(s.code),lower($8))>0)) AND ($9::text IS NULL OR r.status=$9) ORDER BY r.id LIMIT $6`;
      else {
        const table =
          entity === "transfers"
            ? "transfers"
            : entity === "inbounds"
              ? "inbounds"
              : "outbounds";
        const select =
          table === "outbounds"
            ? "o.*"
            : table === "inbounds"
              ? "x.*"
              : "x.*,o.source_warehouse_id,o.destination_warehouse_id,o.state,o.version";
        const from =
          table === "outbounds"
            ? "outbounds o"
            : `${table} x JOIN outbounds o ON o.id=x.outbound_id`;
        const key = table === "outbounds" ? "o.id" : "x.id";
        sql = `SELECT ${select} FROM ${from} WHERE ($1 OR(o.source_warehouse_id=ANY($2::uuid[]) AND o.destination_warehouse_id=ANY($2::uuid[]))) AND ($3::uuid IS NULL OR o.source_warehouse_id=$3 OR o.destination_warehouse_id=$3) AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM outbound_lines l WHERE l.outbound_id=o.id AND l.sku_id=$4)) AND ($5::uuid IS NULL OR ${key}>$5) AND ($7::uuid IS NULL OR ${key}=$7) AND ($8::text IS NULL OR strpos(o.business_ref,$8)>0) AND ($9::text IS NULL OR o.state=$9) ORDER BY ${key} LIMIT $6`;
      }
      const rows = (await c.query(sql, args)).rows,
        more = rows.length > limit;
      const items = rows.slice(0, limit);
      if (id && !nested && !items.length) fail(404);
      if (id && !nested) {
        if (entity === "transactions") {
          items[0].entries = (
            await c.query(
              "SELECT * FROM inventory_entries WHERE transaction_id=$1 ORDER BY line_no",
              [id],
            )
          ).rows;
          items[0].evidence = (
            await c.query("SELECT * FROM inventory_evidence WHERE id=$1", [
              items[0].evidence_id,
            ])
          ).rows[0];
        }
        if (entity === "outbounds" || entity === "transfers") {
          const outboundId = entity === "transfers" ? items[0].outbound_id : id;
          items[0].shipments_url = "outbounds/" + outboundId + "/shipments";
          items[0].lines = (
            await c.query(
              "SELECT l.*, (l.requested_qty-l.cancelled_qty-l.shipped_qty)::text AS unshipped FROM outbound_lines l WHERE outbound_id=$1 ORDER BY id",
              [outboundId],
            )
          ).rows;
          items[0].shipments = (
            await c.query(
              "SELECT sl.*,sh.evidence_id FROM shipments sh JOIN shipment_lines sl ON sl.shipment_id=sh.id WHERE sh.outbound_id=$1 ORDER BY sl.id LIMIT 100",
              [outboundId],
            )
          ).rows;
        }
        if (entity === "inbounds") {
          items[0].receipts_url = "inbounds/" + id + "/receipts";
          items[0].lines = (
            await c.query(
              "SELECT *, (expected_qty-received_qty)::text AS unreceived FROM inbound_lines WHERE inbound_id=$1 ORDER BY id",
              [id],
            )
          ).rows;
        }
      }
      const payload = Buffer.from(
        JSON.stringify({ filter, after: items.at(-1)?.id }),
      ).toString("base64url");
      const cursor = more
        ? payload +
          "." +
          createHmac("sha256", this.key).update(payload).digest("hex")
        : null;
      return id && !nested
        ? items[0]
        : { items, nextCursor: cursor, asOf: new Date().toISOString() };
    });
  }
}
