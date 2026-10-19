import { randomUUID } from "node:crypto";
import { inventoryFixture } from "./inventory-helper";
import { DocumentService } from "../apps/api/src/documents/service";
import { sampleTemplates } from "../apps/api/src/documents/templates";
export async function documentFixture() {
  const f = await inventoryFixture();
  const ctx = {
    token: f.cookie.slice("wms_session=".length),
    csrf: f.csrf,
    origin: f.origin,
    ip: "synthetic-document",
    requestId: "synthetic-document-request",
  };
  const documents = new DocumentService(f.service);
  const template = await documents.registerTemplate(ctx, randomUUID(), {
    code: "sample-instruction",
    kind: "instruction",
    version: 1,
    definition: sampleTemplates.instruction,
  });
  await f.opening();
  const outbound = await f.draft();
  const input = {
    outboundId: outbound.id,
    outboundVersion: "1",
    templateId: template.id,
    templateVersion: 1,
    locale: "ja" as const,
  };
  const record = (key = randomUUID()) =>
    documents.recordSnapshot(ctx, key, input);
  async function stockDigest() {
    const tables = [
      "outbounds",
      "outbound_lines",
      "inbounds",
      "inbound_lines",
      "inventory_transactions",
      "inventory_entries",
      "inventory_balances",
      "reservations",
      "shipments",
      "shipment_lines",
      "receipts",
      "receipt_lines",
      "transfers",
      "reconciliation_runs",
      "outbox",
    ];
    const result: Record<string, unknown> = {};
    for (const table of tables)
      result[table] = (
        await f.db.pool.query(
          `SELECT coalesce(jsonb_agg(t ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS data FROM ${table} t`,
        )
      ).rows[0].data;
    return result;
  }
  return {
    ...f,
    ctx,
    documents,
    template,
    outbound,
    input,
    record,
    stockDigest,
  };
}
