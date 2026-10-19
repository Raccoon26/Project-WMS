import { beforeEach, afterEach, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { documentFixture } from "../document-helper";
import { catalogUser } from "../catalog-access-helper";
import {
  DocumentService,
  documentHash,
} from "../../apps/api/src/documents/service";
import { sampleTemplates } from "../../apps/api/src/documents/templates";
import { PostgresSnapshotBuilder } from "../../apps/api/src/documents/snapshot";
import type { SnapshotBuilder } from "@wms/contracts";
import type { PoolClient } from "pg";
let f: Awaited<ReturnType<typeof documentFixture>>;
beforeEach(async () => {
  f = await documentFixture();
});
afterEach(async () => {
  await f?.cleanup();
});
it("document snapshot uses existing Outbound/SKU/Warehouse and leaves all inventory/reservation/shipment data unchanged", async () => {
  const before = await f.stockDigest(),
    r = await f.record(),
    d = await f.documents.read(f.ctx, r.documentId);
  expect(r).toMatchObject({
    sample: true,
    dispatchable: false,
    outboundId: f.outbound.id,
    contentVersion: "1",
  });
  expect(d.state).toBe("pending");
  expect(d.stale).toBe(false);
  expect(d.snapshot.lines[0]).toMatchObject({
    skuId: f.sku.id,
    skuCode: f.sku.code,
    requested: "100",
    shipped: "0",
    remaining: "100",
  });
  expect(d.snapshot.outbound.source.id).toBe(f.warehouse.id);
  expect(documentHash(d.snapshot)).toBe(r.snapshotSha256);
  expect(d.artifacts).toHaveLength(2);
  expect(
    d.artifacts.every(
      (a) => a.sha256 === null && a.byte_size === null && a.state === "pending",
    ),
  ).toBe(true);
  expect(await f.stockDigest()).toEqual(before);
  expect(
    (
      await f.db.pool.query(
        "SELECT count(*)::int n FROM audit_events WHERE action='documents.snapshot_recorded'",
      )
    ).rows[0].n,
  ).toBe(1);
});
it("same actor/key concurrent snapshot command commits one immutable document and replay rechecks authority", async () => {
  const k = randomUUID();
  const [a, b] = await Promise.all([f.record(k), f.record(k)]);
  expect(a).toEqual(b);
  expect(
    (await f.db.pool.query("SELECT count(*)::int n FROM documents")).rows[0].n,
  ).toBe(1);
  await expect(
    f.documents.recordSnapshot(f.ctx, k, { ...f.input, locale: "ko" }),
  ).rejects.toMatchObject({ status: 409 });
  await f.db.pool.query("UPDATE users SET status='inactive' WHERE id=$1", [
    f.bootstrap.id,
  ]);
  await expect(f.record(k)).rejects.toMatchObject({ status: 401 });
});
it("two different MFA actors allocate unique consecutive content versions under the actual Outbound row lock", async () => {
  const manager = await catalogUser(f, ["Manager"]);
  const other = new DocumentService(f.service);
  const results = await Promise.all([
    f.record(),
    other.recordSnapshot(manager.ctx, randomUUID(), f.input),
  ]);
  expect(results.map((r) => r.contentVersion).sort()).toEqual(["1", "2"]);
  expect(new Set(results.map((r) => r.documentId)).size).toBe(2);
});
it("template version append preserves old definitions and documents across replacement", async () => {
  const a = await f.record();
  const changed = {
    ...sampleTemplates.instruction,
    title: {
      ...sampleTemplates.instruction.title,
      ja: "サンプル出荷指示書 第二版",
    },
  };
  await f.documents.registerTemplate(f.ctx, randomUUID(), {
    code: "sample-instruction",
    kind: "instruction",
    version: 2,
    definition: changed,
  });
  const b = await f.documents.recordSnapshot(f.ctx, randomUUID(), {
    ...f.input,
    templateVersion: 2,
  });
  expect(b.templateId).toBe(a.templateId);
  expect(b.templateVersion).toBe(2);
  expect(b.contentVersion).toBe("2");
  expect(
    (await f.documents.read(f.ctx, a.documentId)).snapshot.template.version,
  ).toBe(1);
  for (const table of [
    "document_template_versions",
    "documents",
    "document_lines",
    "document_sources",
    "document_events",
  ]) {
    if (table === "document_sources") continue;
    await expect(f.db.pool.query(`DELETE FROM ${table}`)).rejects.toMatchObject(
      { code: "23514" },
    );
  }
  await expect(
    f.db.pool.query("UPDATE document_template_versions SET version=9"),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.db.pool.query("UPDATE documents SET sample=false"),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.documents.registerTemplate(f.ctx, randomUUID(), {
      code: "sample-instruction",
      kind: "instruction",
      version: 2,
      definition: changed,
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it("stale expected Outbound version and missing template never record partial snapshots", async () => {
  await expect(
    f.documents.recordSnapshot(f.ctx, randomUUID(), {
      ...f.input,
      outboundVersion: "2",
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    f.documents.recordSnapshot(f.ctx, randomUUID(), {
      ...f.input,
      templateId: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (await f.db.pool.query("SELECT count(*)::int n FROM documents")).rows[0].n,
  ).toBe(0);
});
it("partial100/95/93 captures reserved5 remaining5 received93 transit2 without changing any source state", async () => {
  await f.command("outbounds/" + f.outbound.id + "/reserve", { version: "1" });
  const ship = (
    await f.command("outbounds/" + f.outbound.id + "/shipments", {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      version: "2",
      line_id: f.outbound.line.id,
      quantity: "95",
    })
  ).json();
  const inbound = (await f.request("inbounds/" + f.outbound.inbound_id)).json();
  const response = await f.command(
    "inbounds/" + f.outbound.inbound_id + "/receipts",
    {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      version: inbound.version,
      shipment_line_id: ship.shipment_line_id,
      quantity: "93",
      condition: "good",
    },
  );
  expect(response.statusCode).toBe(200);
  const current = (await f.request("outbounds/" + f.outbound.id)).json();
  const before = await f.stockDigest();
  const r = await f.documents.recordSnapshot(f.ctx, randomUUID(), {
    ...f.input,
    outboundVersion: current.version,
  });
  const d = await f.documents.read(f.ctx, r.documentId);
  expect(d.snapshot.lines[0]).toMatchObject({
    requested: "100",
    remaining: "5",
    reserved: "5",
    shipped: "95",
    received: "93",
    transit: "2",
  });
  expect(d.snapshot.sources).toHaveLength(2);
  expect(await f.stockDigest()).toEqual(before);
  await f.invariant();
});
it("a preserved old document becomes explicitly stale after Outbound changes, but same-key replay returns its original version", async () => {
  const key = randomUUID(),
    a = await f.record(key);
  await f.command("outbounds/" + f.outbound.id + "/reserve", { version: "1" });
  expect((await f.documents.read(f.ctx, a.documentId)).stale).toBe(true);
  expect(await f.record(key)).toEqual(a);
  expect(
    (await f.documents.read(f.ctx, a.documentId)).snapshot.lines[0]!.reserved,
  ).toBe("0");
});
it("Viewer read-only, single warehouse scope, missing MFA and forged CSRF cannot create or read outside permission", async () => {
  const a = await f.record(),
    viewer = await catalogUser(f, ["Viewer"]),
    scoped = await catalogUser(f, ["Operator"], f.warehouse.id);
  expect((await f.documents.read(viewer.ctx, a.documentId)).state).toBe(
    "pending",
  );
  await expect(
    f.documents.recordSnapshot(viewer.ctx, randomUUID(), f.input),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    f.documents.read(scoped.ctx, a.documentId),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    f.documents.recordSnapshot(
      { ...f.ctx, csrf: "forged" },
      randomUUID(),
      f.input,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    f.documents.recordSnapshot(
      { ...f.ctx, token: "missing" },
      randomUUID(),
      f.input,
    ),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    f.documents.registerTemplate(viewer.ctx, randomUUID(), {
      code: "unapproved-template",
      kind: "manifest",
      version: 1,
      definition: sampleTemplates.manifest,
    }),
  ).rejects.toMatchObject({ status: 403 });
});
it("snapshot and command result roll back if mandatory Audit persistence fails", async () => {
  await f.db.pool.query(
    "CREATE FUNCTION fail_document_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='documents.snapshot_recorded' THEN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_document_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_document_audit()",
  );
  const before = await f.stockDigest();
  await expect(f.record()).rejects.toThrow();
  for (const t of [
    "documents",
    "document_lines",
    "document_sources",
    "document_artifacts",
    "document_events",
  ])
    expect(
      (await f.db.pool.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n,
    ).toBe(0);
  expect(
    (
      await f.db.pool.query(
        "SELECT count(*)::int n FROM command_results WHERE operation='documents.snapshot'",
      )
    ).rows[0].n,
  ).toBe(0);
  expect(await f.stockDigest()).toEqual(before);
});
it.each(["sku", "quantity", "warehouse", "omission", "hash"])(
  "DB rejects a builder's forged %s snapshot, not just TypeScript",
  async (kind) => {
    const builder: SnapshotBuilder<PoolClient> = {
      build: async (c, input) => {
        const s = await new PostgresSnapshotBuilder().build(c, input);
        if (kind === "sku")
          return { ...s, lines: [{ ...s.lines[0]!, skuId: randomUUID() }] };
        if (kind === "quantity")
          return { ...s, lines: [{ ...s.lines[0]!, requested: "101" }] };
        if (kind === "warehouse")
          return {
            ...s,
            outbound: {
              ...s.outbound,
              source: { ...s.outbound.source, name: "Forged source" },
            },
          };
        if (kind === "omission") return { ...s, lines: [] };
        return { ...s, template: { ...s.template, sha256: "0".repeat(64) } };
      },
    };
    await expect(
      new DocumentService(f.service, builder).recordSnapshot(
        f.ctx,
        randomUUID(),
        f.input,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    expect(
      (await f.db.pool.query("SELECT count(*)::int n FROM documents")).rows[0]
        .n,
    ).toBe(0);
  },
);
it("committed document cannot accept late line/source/artifact insertions and relational parent FK prevents mismatches", async () => {
  const a = await f.record();
  await expect(
    f.db.pool.query(
      "INSERT INTO document_artifacts(id,document_id,format,storage_key) VALUES($1,$2,'xlsx',$3)",
      [randomUUID(), a.documentId, randomUUID() + ".xlsx"],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.db.pool.query(
      "INSERT INTO document_sources(id,document_id,outbound_line_id,reservation_id,snapshot) VALUES($1,$2,$3,$4,'{}')",
      [randomUUID(), a.documentId, f.outbound.line.id, randomUUID()],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const refs = await f.db.pool.query(
    "SELECT count(*)::int n FROM information_schema.table_constraints WHERE table_schema=current_schema() AND table_name LIKE 'document%' AND constraint_type='FOREIGN KEY'",
  );
  expect(refs.rows[0].n).toBeGreaterThanOrEqual(15);
});
it("document quantities retain integers beyond Number.MAX_SAFE_INTEGER exactly", async () => {
  const q = "9007199254740993";
  const edit = await f.command(
    "outbounds/" + f.outbound.id,
    {
      version: "1",
      lines: [{ sku_id: f.sku.id, sku_version: 1, quantity: q }],
    },
    randomUUID(),
    "PATCH",
  );
  expect(edit.statusCode).toBe(200);
  const current = (await f.request("outbounds/" + f.outbound.id)).json();
  const d = await f.documents.recordSnapshot(f.ctx, randomUUID(), {
    ...f.input,
    outboundVersion: current.version,
  });
  expect(
    (await f.documents.read(f.ctx, d.documentId)).snapshot.lines[0]!.requested,
  ).toBe(q);
  expect(
    (
      await f.db.pool.query(
        "SELECT pg_typeof(outbound_version)::text t,pg_typeof(content_version)::text v FROM documents",
      )
    ).rows[0],
  ).toEqual({ t: "bigint", v: "bigint" });
});
it("historical Snapshot preserves warehouse/SKU labels and old template while future captures use current metadata", async () => {
  const a = await f.record();
  const old = await f.documents.read(f.ctx, a.documentId);
  await f.db.pool.query(
    "UPDATE warehouses SET name='変更後の倉庫' WHERE id=$1",
    [f.warehouse.id],
  );
  await f.db.pool.query(
    "UPDATE products SET name_ja='変更後の商品' WHERE id=$1",
    [f.product.id],
  );
  expect((await f.documents.read(f.ctx, a.documentId)).stale).toBe(true);
  const b = await f.record();
  expect((await f.documents.read(f.ctx, a.documentId)).snapshot).toEqual(
    old.snapshot,
  );
  expect(
    (await f.documents.read(f.ctx, b.documentId)).snapshot.outbound.source.name,
  ).toBe("変更後の倉庫");
  expect(
    (await f.documents.read(f.ctx, b.documentId)).snapshot.lines[0]!
      .productName,
  ).toBe("変更後の商品");
  await f.db.pool.query(
    "UPDATE document_templates SET active=false WHERE id=$1",
    [f.template.id],
  );
  await expect(f.record()).rejects.toMatchObject({ status: 404 });
  expect((await f.documents.read(f.ctx, a.documentId)).snapshot).toEqual(
    old.snapshot,
  );
});
it("artifact metadata transitions require append-only same-transaction events, immutable binary hash, exact revision and opaque keys", async () => {
  const d = await f.record(),
    a = (await f.documents.read(f.ctx, d.documentId)).artifacts[0]!;
  const key = a.id as string;
  await expect(
    f.db.pool.query(
      "UPDATE document_artifacts SET state='ready',revision=revision+1 WHERE id=$1",
      [key],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.db.pool.query(
      "UPDATE document_artifacts SET storage_key='../escape.xlsx',revision=revision+1 WHERE id=$1",
      [key],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.db.pool.query(
      "UPDATE document_artifacts SET state='staged',sha256=$2,byte_size=10,renderer_version='metadata-test',revision=revision+1 WHERE id=$1",
      [key, "a".repeat(64)],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  expect(
    (await f.documents.read(f.ctx, d.documentId)).artifacts[0]!.state,
  ).toBe("pending");
  let seq = 1;
  async function transition(id: string, state: string, initialize = false) {
    await f.service.tx(async (c) => {
      const args: unknown[] = [id, state];
      let extra = "";
      if (initialize) {
        args.push("a".repeat(64));
        extra =
          ",sha256=$3,byte_size=10,renderer_version='metadata-contract-test'";
      }
      const row = (
        await c.query(
          "UPDATE document_artifacts SET state=$2,revision=revision+1" +
            extra +
            " WHERE id=$1 RETURNING revision",
          args,
        )
      ).rows[0];
      await c.query(
        "INSERT INTO document_events(id,document_id,artifact_id,artifact_revision,state,sequence,event,actor_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'synthetic-metadata-test')",
        [
          randomUUID(),
          d.documentId,
          id,
          row.revision,
          state,
          ++seq,
          "artifact_" + state,
          f.bootstrap.id,
        ],
      );
      await f.service.audit(
        c,
        f.bootstrap.id,
        "documents.metadata_contract_test",
        d.documentId,
        "TEST_ONLY",
        f.ctx.requestId,
      );
    });
  }
  await transition(key, "staged", true);
  await transition(key, "ready");
  expect((await f.documents.read(f.ctx, d.documentId)).state).toBe("rendering");
  const other = (await f.documents.read(f.ctx, d.documentId)).artifacts.find(
    (x) => x.id !== key,
  )!.id as string;
  await transition(other, "staged", true);
  await transition(other, "ready");
  expect((await f.documents.read(f.ctx, d.documentId)).state).toBe("ready");
  await transition(key, "corrupt");
  expect((await f.documents.read(f.ctx, d.documentId)).state).toBe(
    "quarantined",
  );
  await expect(
    f.db.pool.query(
      "UPDATE document_artifacts SET sha256=$2,state='ready',revision=revision+1 WHERE id=$1",
      [key, "b".repeat(64)],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await transition(key, "ready");
  await expect(
    f.db.pool.query("DELETE FROM document_events WHERE document_id=$1", [
      d.documentId,
    ]),
  ).rejects.toMatchObject({ code: "23514" });
  // DB metadata only: no artifact bytes or file recovery is claimed by this test.
});
it("every intermediate artifact state change requires its own event, and null metadata cannot pass SQL CHECK", async () => {
  const d = await f.record(),
    a = (await f.documents.read(f.ctx, d.documentId)).artifacts[0]!.id;
  await expect(
    f.db.pool.query(
      "UPDATE document_artifacts SET state='staged',sha256=$2,byte_size=10,renderer_version=NULL,revision=revision+1 WHERE id=$1",
      [a, "a".repeat(64)],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.service.tx(async (c) => {
      await c.query(
        "UPDATE document_artifacts SET state='staged',sha256=$2,byte_size=10,renderer_version='synthetic',revision=2 WHERE id=$1",
        [a, "a".repeat(64)],
      );
      await c.query(
        "UPDATE document_artifacts SET state='ready',revision=3 WHERE id=$1",
        [a],
      );
      await c.query(
        "INSERT INTO document_events(id,document_id,artifact_id,artifact_revision,state,sequence,event,actor_id,request_id) VALUES($1,$2,$3,3,'ready',2,'artifact_ready',$4,'synthetic')",
        [randomUUID(), d.documentId, a, f.bootstrap.id],
      );
    }),
  ).rejects.toMatchObject({ code: "23514" });
  expect((await f.documents.read(f.ctx, d.documentId)).state).toBe("pending");
});
it.each(["reservation", "shipment"])(
  "existing but unrelated %s FK cannot be attached to this Outbound Snapshot",
  async (kind) => {
    const edit = await f.command(
      "outbounds/" + f.outbound.id,
      {
        version: "1",
        lines: [{ sku_id: f.sku.id, sku_version: 1, quantity: "50" }],
      },
      randomUUID(),
      "PATCH",
    );
    expect(edit.statusCode).toBe(200);
    await f.command("outbounds/" + f.outbound.id + "/reserve", {
      version: "2",
    });
    const other = await f.draft("25");
    await f.command("outbounds/" + other.id + "/reserve", { version: "1" });
    let foreign: string;
    if (kind === "reservation")
      foreign = (
        await f.db.pool.query(
          "SELECT id FROM reservations WHERE outbound_line_id=$1",
          [other.line.id],
        )
      ).rows[0].id;
    else {
      const a = await f.command("outbounds/" + f.outbound.id + "/shipments", {
        ...f.evidence(),
        sku_id: f.sku.id,
        sku_version: 1,
        version: "3",
        line_id: f.outbound.line.id,
        quantity: "50",
      });
      expect(a.statusCode).toBe(200);
      const b = await f.command("outbounds/" + other.id + "/shipments", {
        ...f.evidence(),
        sku_id: f.sku.id,
        sku_version: 1,
        version: "2",
        line_id: other.line.id,
        quantity: "25",
      });
      expect(b.statusCode).toBe(200);
      foreign = b.json().shipment_line_id;
    }
    const builder: SnapshotBuilder<PoolClient> = {
      build: async (c, input) => {
        const s = await new PostgresSnapshotBuilder().build(c, input);
        return {
          ...s,
          sources: s.sources.map((source) =>
            kind === "reservation" && source.reservationId
              ? { ...source, reservationId: foreign }
              : kind === "shipment" && source.shipmentLineId
                ? { ...source, shipmentLineId: foreign }
                : source,
          ),
        };
      },
    };
    const current = (await f.request("outbounds/" + f.outbound.id)).json();
    await expect(
      new DocumentService(f.service, builder).recordSnapshot(
        f.ctx,
        randomUUID(),
        { ...f.input, outboundVersion: current.version },
      ),
    ).rejects.toMatchObject({ code: "23514" });
    expect(
      (await f.db.pool.query("SELECT count(*)::int n FROM documents")).rows[0]
        .n,
    ).toBe(0);
    await f.invariant();
  },
);
it("PostgreSQL composite template PK, actor FK, native hash and sample-only constraints reject invalid metadata", async () => {
  const t = f.template.id,
    user = f.bootstrap.id;
  const sql =
    "INSERT INTO document_template_versions(template_id,version,definition,canonical,sha256,sample,created_by) SELECT template_id,$2,definition,canonical,$3,$4,$5 FROM document_template_versions WHERE template_id=$1 AND version=1";
  const sha = (
    await f.db.pool.query(
      "SELECT sha256 FROM document_template_versions WHERE template_id=$1",
      [t],
    )
  ).rows[0].sha256;
  await expect(
    f.db.pool.query(sql, [t, 1, sha, true, user]),
  ).rejects.toMatchObject({ code: "23505" });
  await expect(
    f.db.pool.query(sql, [t, 2, sha, true, randomUUID()]),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    f.db.pool.query(sql, [t, 2, "b".repeat(64), true, user]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.db.pool.query(sql, [t, 2, sha, false, user]),
  ).rejects.toMatchObject({ code: "23514" });
  const a = await f.record();
  await expect(
    f.db.pool.query(
      "INSERT INTO document_events(id,document_id,artifact_id,artifact_revision,state,sequence,event,actor_id,request_id) VALUES($1,$2,$3,2,'ready',2,'artifact_ready',$4,'synthetic')",
      [randomUUID(), a.documentId, randomUUID(), user],
    ),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    f.documents.recordSnapshot(
      { ...f.ctx, origin: "https://malicious.invalid" },
      randomUUID(),
      f.input,
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("Receipt source changes invalidate an old Snapshot even when the Outbound header version is unchanged", async () => {
  await f.command("outbounds/" + f.outbound.id + "/reserve", { version: "1" });
  const ship = await f.command("outbounds/" + f.outbound.id + "/shipments", {
    ...f.evidence(),
    sku_id: f.sku.id,
    sku_version: 1,
    version: "2",
    line_id: f.outbound.line.id,
    quantity: "95",
  });
  expect(ship.statusCode).toBe(200);
  const before = (await f.request("outbounds/" + f.outbound.id)).json();
  const d = await f.documents.recordSnapshot(f.ctx, randomUUID(), {
    ...f.input,
    outboundVersion: before.version,
  });
  expect((await f.documents.read(f.ctx, d.documentId)).stale).toBe(false);
  const receipt = await f.command(
    "inbounds/" + f.outbound.inbound_id + "/receipts",
    {
      ...f.evidence(),
      sku_id: f.sku.id,
      sku_version: 1,
      version: "1",
      shipment_line_id: ship.json().shipment_line_id,
      quantity: "93",
      condition: "good",
    },
  );
  expect(receipt.statusCode).toBe(200);
  expect((await f.request("outbounds/" + f.outbound.id)).json().version).toBe(
    before.version,
  );
  const preserved = await f.documents.read(f.ctx, d.documentId);
  expect(preserved.stale).toBe(true);
  expect(preserved.snapshot.lines[0]!.received).toBe("0");
  expect(preserved.snapshot.lines[0]!.transit).toBe("95");
});
