import { beforeEach, afterEach, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { documentFixture } from "../document-helper";
import { sampleTemplateManifests } from "../../apps/api/src/documents/templates";
import { DocumentService } from "../../apps/api/src/documents/service";
import { PostgresSnapshotBuilder } from "../../apps/api/src/documents/snapshot";
let f: Awaited<ReturnType<typeof documentFixture>>;
beforeEach(async () => {
  f = await documentFixture();
});
afterEach(async () => {
  await f?.cleanup();
});
async function register(index = 0) {
  return f.documents.registerTemplate(
    f.ctx,
    randomUUID(),
    sampleTemplateManifests[index]!,
  );
}
async function reserve() {
  const r = await f.command(`outbounds/${f.outbound.id}/reserve`, {
    version: "1",
  });
  expect(r.statusCode).toBe(200);
}
async function record(
  template: { id: string },
  version = "2",
  selection?: {
    lines?: { lineId: string; quantity: string }[];
    shipmentLineIds?: string[];
  },
) {
  return f.documents.recordSnapshot(f.ctx, randomUUID(), {
    ...f.input,
    templateId: template.id,
    outboundVersion: version,
    ...(selection ? { selection } : {}),
  });
}
async function ship(version: string, quantity: string) {
  const r = await f.command(`outbounds/${f.outbound.id}/shipments`, {
    ...f.evidence(),
    sku_id: f.sku.id,
    sku_version: 1,
    version,
    line_id: f.outbound.line.id,
    quantity,
  });
  expect(r.statusCode).toBe(200);
  return r.json();
}
it("four actual PG registered sample plans pin version/hash/format and cannot be modified or deleted", async () => {
  await reserve();
  for (const [i, t] of sampleTemplateManifests.entries()) {
    const registered = await register(i);
    const row = (
      await f.db.pool.query(
        "SELECT * FROM document_template_versions WHERE template_id=$1",
        [registered.id],
      )
    ).rows[0];
    expect(row.sample).toBe(true);
    expect(row.definition).toEqual(t.definition);
    await expect(
      f.db.pool.query(
        "UPDATE document_template_versions SET definition='{}' WHERE template_id=$1",
        [registered.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      f.db.pool.query(
        "DELETE FROM document_template_versions WHERE template_id=$1",
        [registered.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  }
  const t = (
    await f.db.pool.query(
      "SELECT id FROM document_templates WHERE code='sample-instruction-xlsx'",
    )
  ).rows[0];
  const r = await record(t);
  const d = await f.documents.read(f.ctx, r.documentId);
  expect(d.snapshot.documentQuantities?.lines[0]!.quantity).toBe("100");
  expect(d.artifacts).toHaveLength(1);
  expect(d.artifacts[0]!.format).toBe("xlsx");
  expect(r.dispatchable).toBe(false);
  expect(d.stale).toBe(false);
});
it("100 requested /95 shipped /93 received yields new instruction5, reserved5, transit2, received93, manifest95", async () => {
  await reserve();
  const s = await ship("2", "95");
  const inbound = (await f.request(`inbounds/${f.outbound.inbound_id}`)).json();
  const received = await f.command(
    `inbounds/${f.outbound.inbound_id}/receipts`,
    {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      version: inbound.version,
      shipment_line_id: s.shipment_line_id,
      quantity: "93",
      condition: "good",
    },
  );
  expect(received.statusCode).toBe(200);
  const before = await f.stockDigest();
  const r = await record(await register(), "3");
  const d = await f.documents.read(f.ctx, r.documentId);
  expect(d.snapshot.lines[0]).toMatchObject({
    requested: "100",
    cancelled: "0",
    remaining: "5",
    reserved: "5",
    shipped: "95",
    transit: "2",
    received: "93",
  });
  expect(d.snapshot.documentQuantities).toMatchObject({
    purpose: "instruction",
    shipmentLineIds: [],
    lines: [{ lineId: f.outbound.line.id, quantity: "5" }],
  });
  const m = await record(await register(3), "3", {
    shipmentLineIds: [s.shipment_line_id],
  });
  const md = await f.documents.read(f.ctx, m.documentId);
  expect(md.snapshot.documentQuantities?.lines[0]!.quantity).toBe("95");
  expect(md.artifacts[0]!.format).toBe("pdf");
  expect(await f.stockDigest()).toEqual(before);
  await f.invariant();
});
it("multiple shipments may be selected independently and cumulative quantities never become instructions", async () => {
  await reserve();
  const a = await ship("2", "40");
  const b = await ship("3", "55");
  const t = await register(2);
  for (const [ids, quantity] of [
    [[a.shipment_line_id], "40"],
    [[b.shipment_line_id], "55"],
    [[a.shipment_line_id, b.shipment_line_id], "95"],
  ] as [string[], string][]) {
    const r = await record(t, "4", { shipmentLineIds: ids });
    expect(
      (await f.documents.read(f.ctx, r.documentId)).snapshot.documentQuantities
        ?.lines[0]!.quantity,
    ).toBe(quantity);
  }
  const r = await record(await register(), "4");
  expect(
    (await f.documents.read(f.ctx, r.documentId)).snapshot.documentQuantities
      ?.lines[0]!.quantity,
  ).toBe("5");
  await expect(
    record(t, "4", { shipmentLineIds: [randomUUID()] }),
  ).rejects.toMatchObject({ status: 409 });
});
it("partial selection, zero, overquantity, client metadata override and version conflict are checked without stock writes", async () => {
  await reserve();
  const t = await register();
  const before = await f.stockDigest();
  const r = await record(t, "2", {
    lines: [{ lineId: f.outbound.line.id, quantity: "7" }],
  });
  expect(
    (await f.documents.read(f.ctx, r.documentId)).snapshot.documentQuantities
      ?.lines[0]!.quantity,
  ).toBe("7");
  for (const quantity of ["0", "101", "-1", "01"])
    await expect(
      record(t, "2", { lines: [{ lineId: f.outbound.line.id, quantity }] }),
    ).rejects.toMatchObject({ status: 409 });
  await expect(record(t, "1")).rejects.toMatchObject({ status: 409 });
  await expect(
    f.documents.recordSnapshot(f.ctx, randomUUID(), {
      ...f.input,
      templateId: t.id,
      outboundVersion: "2",
      productName: "forged",
    } as never),
  ).rejects.toMatchObject({ status: 400 });
  expect(await f.stockDigest()).toEqual(before);
});
it("same-key concurrent commands replay one snapshot, source changes produce new content while old bytes are retained", async () => {
  await reserve();
  const t = await register();
  const key = randomUUID();
  const input = { ...f.input, templateId: t.id, outboundVersion: "2" };
  const [a, b] = await Promise.all([
    f.documents.recordSnapshot(f.ctx, key, input),
    f.documents.recordSnapshot(f.ctx, key, input),
  ]);
  expect(a).toEqual(b);
  const old = await f.documents.read(f.ctx, a.documentId);
  await ship("2", "95");
  const updated = await record(t, "3");
  expect(updated.contentVersion).toBe("2");
  const preserved = await f.documents.read(f.ctx, a.documentId);
  expect(preserved.stale).toBe(true);
  expect(preserved.snapshot).toEqual(old.snapshot);
  expect(
    (await f.documents.read(f.ctx, updated.documentId)).snapshot
      .documentQuantities?.lines[0]!.quantity,
  ).toBe("5");
});
it("cancelled and unreserved outbounds cannot create an executable positive instruction", async () => {
  const t = await register();
  await expect(record(t, "1")).rejects.toMatchObject({ status: 409 });
  await reserve();
  const r = await f.command(`outbounds/${f.outbound.id}/cancel`, {
    version: "2",
  });
  expect(r.statusCode).toBe(200);
  const current = (await f.request(`outbounds/${f.outbound.id}`)).json();
  await expect(record(t, current.version)).rejects.toMatchObject({
    status: 409,
  });
});
it("DB independently rejects a forged builder's this-document quantity even when its SHA is genuine", async () => {
  await reserve();
  const t = await register();
  const before = await f.stockDigest();
  const service = new DocumentService(f.service, {
    build: async (c, i) => {
      const s = await new PostgresSnapshotBuilder().build(c, i);
      return {
        ...s,
        documentQuantities: {
          purpose: "instruction",
          shipmentLineIds: [],
          lines: [{ lineId: f.outbound.line.id, quantity: "101" }],
        },
      };
    },
  });
  await expect(
    service.recordSnapshot(f.ctx, randomUUID(), {
      ...f.input,
      templateId: t.id,
      outboundVersion: "2",
    }),
  ).rejects.toMatchObject({ code: "23514" });
  expect(
    (await f.db.pool.query("SELECT count(*)::int n FROM documents")).rows[0].n,
  ).toBe(0);
  expect(await f.stockDigest()).toEqual(before);
});

it("multiple real SKU lines permit explicit zero omission and preserve separate quantities", async () => {
  const sku = await f.create("skus", {
    product_id: f.product.id,
    code: "DOCUMENT-SECOND-SKU",
  });
  const opening = await f.command("inventory/openings", {
    ...f.evidence(),
    sku_id: sku.id,
    sku_version: 1,
    warehouse_id: f.warehouse.id,
    quantity: "30",
  });
  expect(opening.statusCode).toBe(200);
  const outbound = await f.create("outbounds", {
    business_ref: randomUUID(),
    source_warehouse_id: f.warehouse.id,
    destination_warehouse_id: f.destination.id,
    lines: [
      { sku_id: f.sku.id, sku_version: 1, quantity: "100" },
      { sku_id: sku.id, sku_version: 1, quantity: "30" },
    ],
  });
  f.outbound.id = outbound.id;
  f.input.outboundId = outbound.id;
  await reserve();
  const current = (await f.request(`outbounds/${f.outbound.id}`)).json();
  const lines = current.lines as { id: string; sku_id: string }[];
  const first = lines.find((l) => l.sku_id === f.sku.id)!;
  const t = await register();
  const before = await f.stockDigest();
  const doc = await record(t, "2", {
    lines: [{ lineId: first.id, quantity: "4" }],
  });
  const d = await f.documents.read(f.ctx, doc.documentId);
  expect(d.snapshot.documentQuantities?.lines).toEqual(
    expect.arrayContaining([
      { lineId: first.id, quantity: "4" },
      { lineId: lines.find((l) => l.sku_id === sku.id)!.id, quantity: "0" },
    ]),
  );
  expect(d.snapshot.lines).toHaveLength(2);
  expect(await f.stockDigest()).toEqual(before);
});
it("real PG snapshot plan preserves selected bigint units above the JS safe integer boundary", async () => {
  const q = "9007199254740993";
  const sku = await f.create("skus", {
    product_id: f.product.id,
    code: "DOCUMENT-BIGINT-SKU",
  });
  expect(
    (
      await f.command("inventory/openings", {
        ...f.evidence(),
        sku_id: sku.id,
        sku_version: 1,
        warehouse_id: f.warehouse.id,
        quantity: q,
      })
    ).statusCode,
  ).toBe(200);
  const outbound = await f.create("outbounds", {
    business_ref: randomUUID(),
    source_warehouse_id: f.warehouse.id,
    destination_warehouse_id: f.destination.id,
    lines: [{ sku_id: sku.id, sku_version: 1, quantity: q }],
  });
  f.outbound.id = outbound.id;
  f.input.outboundId = outbound.id;
  await reserve();
  const doc = await record(await register(), "2");
  const d = await f.documents.read(f.ctx, doc.documentId);
  expect(d.snapshot.documentQuantities?.lines[0]!.quantity).toBe(q);
  expect(d.snapshot.lines[0]!.requested).toBe(q);
});
it("deactivated real SKU preserves old snapshot for history but blocks new instructions and marks it stale", async () => {
  await reserve();
  const t = await register();
  const r = await record(t);
  const old = await f.documents.read(f.ctx, r.documentId);
  await f.db.pool.query("UPDATE skus SET status='inactive' WHERE id=$1", [
    f.sku.id,
  ]);
  const preserved = await f.documents.read(f.ctx, r.documentId);
  expect(preserved.stale).toBe(true);
  expect(preserved.snapshot).toEqual(old.snapshot);
  await expect(record(t)).rejects.toMatchObject({ status: 409 });
});
it("new template version changes future snapshots only; old format, manifest and snapshot hashes remain pinned", async () => {
  await reserve();
  const t = await register();
  const a = await record(t);
  const old = await f.documents.read(f.ctx, a.documentId);
  const definition = structuredClone(sampleTemplateManifests[0]!.definition);
  definition.title.ja = "サンプル出荷指示書・改訂";
  await f.documents.registerTemplate(f.ctx, randomUUID(), {
    ...sampleTemplateManifests[0]!,
    version: 2,
    definition,
  });
  const b = await f.documents.recordSnapshot(f.ctx, randomUUID(), {
    ...f.input,
    templateId: t.id,
    templateVersion: 2,
    outboundVersion: "2",
  });
  expect(b.contentVersion).toBe("2");
  expect(b.templateVersion).toBe(2);
  expect(b.snapshotSha256).not.toBe(a.snapshotSha256);
  expect((await f.documents.read(f.ctx, a.documentId)).snapshot).toEqual(
    old.snapshot,
  );
});
it.each(["number", "zero", "duplicate", "foreign", "purpose"])(
  "DB rejects forged selection %s independently of application validation",
  async (variant) => {
    await reserve();
    const t = await register();
    const service = new DocumentService(f.service, {
      build: async (c, i) => {
        const s = await new PostgresSnapshotBuilder().build(c, i);
        const q = structuredClone(s.documentQuantities)!;
        if (variant === "number")
          (q.lines[0] as unknown as { quantity: unknown }).quantity = 100;
        if (variant === "zero")
          (q.lines[0] as { quantity: string }).quantity = "0";
        if (variant === "duplicate") (q.lines as unknown[]).push(q.lines[0]);
        if (variant === "foreign")
          (q.lines[0] as { lineId: string }).lineId = randomUUID();
        if (variant === "purpose") q.purpose = "manifest";
        return { ...s, documentQuantities: q };
      },
    });
    await expect(
      service.recordSnapshot(f.ctx, randomUUID(), {
        ...f.input,
        templateId: t.id,
        outboundVersion: "2",
      }),
    ).rejects.toMatchObject({ code: "23514" });
    expect(
      (await f.db.pool.query("SELECT count(*)::int n FROM documents")).rows[0]
        .n,
    ).toBe(0);
  },
);
