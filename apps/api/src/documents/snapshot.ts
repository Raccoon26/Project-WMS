import type { PoolClient } from "pg";
import type {
  SnapshotBuilder,
  OutboundDocumentSnapshot,
  DocumentSnapshotLine,
  DocumentSnapshotSource,
} from "@wms/contracts";
import { documentQuantityPlan } from "@wms/domain";
import { CatalogError } from "../catalog/service.js";
/** Caller owns Session/User -> Outbound -> Warehouse/SKU locks and authorization. */
export class PostgresSnapshotBuilder implements SnapshotBuilder<PoolClient> {
  async build(
    c: PoolClient,
    input: Parameters<SnapshotBuilder<PoolClient>["build"]>[1],
  ): Promise<OutboundDocumentSnapshot> {
    const o = (
      await c.query("SELECT * FROM outbounds WHERE id=$1 FOR UPDATE", [
        input.outboundId,
      ])
    ).rows[0];
    if (!o) throw new CatalogError(404, "NOT_FOUND");
    if (o.version !== input.outboundVersion)
      throw new CatalogError(409, "CONFLICT");
    const w = (
      await c.query(
        "SELECT id,code,name,type FROM warehouses WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
        [[o.source_warehouse_id, o.destination_warehouse_id]],
      )
    ).rows;
    const lines = (
      await c.query(
        `SELECT l.id,l.sku_id AS "skuId",s.code AS "skuCode",p.name_ja AS "productName",
      l.requested_qty AS requested,l.cancelled_qty AS cancelled,(l.requested_qty-l.shipped_qty-l.cancelled_qty)::text AS remaining,l.shipped_qty AS shipped,
      (SELECT coalesce(sum(sl.received_qty),0)::text FROM shipment_lines sl WHERE sl.outbound_line_id=l.id) AS received,
      (SELECT coalesce(sum(r.quantity-r.consumed-r.released),0)::text FROM reservations r WHERE r.outbound_line_id=l.id) AS reserved,
      (SELECT coalesce(sum(sl.shipped_qty-sl.received_qty),0)::text FROM shipment_lines sl WHERE sl.outbound_line_id=l.id) AS transit
      FROM outbound_lines l JOIN skus s ON s.id=l.sku_id JOIN products p ON p.id=s.product_id WHERE l.outbound_id=$1 ORDER BY s.id,l.id FOR SHARE OF l,s,p`,
        [o.id],
      )
    ).rows as DocumentSnapshotLine[];
    const sources = (
      await c.query(
        `SELECT r.outbound_line_id AS "lineId",r.id AS "reservationId",NULL::uuid AS "shipmentLineId",r.quantity::text AS quantity,r.consumed::text AS consumed,r.released::text AS released,'0'::text AS received FROM reservations r JOIN outbound_lines l ON l.id=r.outbound_line_id WHERE l.outbound_id=$1
      UNION ALL SELECT sl.outbound_line_id,NULL,sl.id,sl.shipped_qty::text,'0','0',sl.received_qty::text FROM shipment_lines sl JOIN outbound_lines l ON l.id=sl.outbound_line_id WHERE l.outbound_id=$1 ORDER BY 1,2,3 LIMIT 5001`,
        [o.id],
      )
    ).rows as DocumentSnapshotSource[];
    // Bound source-history materialization before canonical serialization. Never silently truncate.
    if (sources.length > 5000) throw new CatalogError(413, "INVALID_INPUT");
    const capturedAt = (
      await c.query(
        `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS time`,
      )
    ).rows[0].time as string;
    let documentQuantities;
    if (input.template.definition.manifest) {
      if (
        input.template.kind === "instruction" &&
        (
          await c.query(
            "SELECT 1 FROM outbound_lines l JOIN skus s ON s.id=l.sku_id JOIN products p ON p.id=s.product_id WHERE l.outbound_id=$1 AND (s.status<>'active' OR p.status<>'active') UNION ALL SELECT 1 FROM warehouses WHERE id=ANY($2::uuid[]) AND status<>'active' LIMIT 1",
            [o.id, [o.source_warehouse_id, o.destination_warehouse_id]],
          )
        ).rowCount !== 0
      )
        throw new CatalogError(409, "CONFLICT");
      try {
        documentQuantities = documentQuantityPlan(
          input.template.kind,
          o.state,
          lines,
          sources,
          input.selection,
        );
      } catch {
        throw new CatalogError(409, "CONFLICT");
      }
    }
    return {
      ...(documentQuantities ? { documentQuantities } : {}),
      schemaVersion: 1,
      documentId: input.documentId,
      actorId: input.actorId,
      capturedAt,
      sample: true,
      locale: input.locale,
      template: {
        id: input.template.templateId,
        version: input.template.version,
        sha256: input.template.sha256,
        kind: input.template.kind,
      },
      outbound: {
        id: o.id,
        version: o.version,
        businessRef: o.business_ref,
        state: o.state,
        source: w.find((x) => x.id === o.source_warehouse_id)!,
        destination: w.find((x) => x.id === o.destination_warehouse_id)!,
      },
      lines,
      sources,
    };
  }
}
