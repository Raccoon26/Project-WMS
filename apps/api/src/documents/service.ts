import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { canonicalPayload, validTemplateDefinition } from "@wms/domain";
import type {
  DocumentKind,
  DocumentLocale,
  SampleTemplateDefinition,
  DocumentReference,
  DocumentTemplateVersion,
  SnapshotBuilder,
  OutboundDocumentSnapshot,
} from "@wms/contracts";
import { AuthService, AuthError } from "../auth/service.js";
import type { Context, Session } from "../auth/service.js";
import { allowed, recentReauth } from "../auth/policy.js";
import { CatalogError } from "../catalog/service.js";
import { PostgresSnapshotBuilder } from "./snapshot.js";
export const documentHash = (value: unknown) =>
  createHash("sha256").update(canonicalPayload(value)).digest("hex");
const uuid = (v: string) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const version = (v: string) =>
  typeof v === "string" &&
  /^[1-9][0-9]{0,18}$/.test(v) &&
  BigInt(v) <= 9223372036854775807n;
export interface RecordDocumentInput {
  outboundId: string;
  outboundVersion: string;
  templateId: string;
  templateVersion: number;
  locale: DocumentLocale;
}
/** Internal application port, not an unauthenticated HTTP/CLI entrypoint.
 * Stage1 records snapshots + pending metadata only; does not render/publish/send.
 */
export class DocumentService {
  constructor(
    public auth: AuthService,
    private builder: SnapshotBuilder<PoolClient> = new PostgresSnapshotBuilder(),
  ) {}
  private async run<T>(
    ctx: Context,
    write: boolean,
    fn: (c: PoolClient, s: Session) => Promise<T>,
  ) {
    if (write) await this.auth.rate("mutation-ip", ctx.ip, 100, 60);
    try {
      return await this.auth.tx(async (c) => {
        const s = await this.auth.readSession(c, ctx);
        if (write) this.auth.csrf(ctx, s);
        return fn(c, s);
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "23505") throw new CatalogError(409, "CONFLICT");
      throw e;
    }
  }
  private async scope(c: PoolClient, s: Session, id: string, write: boolean) {
    const o = (
      await c.query("SELECT * FROM outbounds WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!o) throw new CatalogError(404, "NOT_FOUND");
    const grants = await this.auth.grants(c, s.user_id!);
    const ids = [o.source_warehouse_id, o.destination_warehouse_id] as string[];
    const known = (
      await c.query(
        "SELECT id FROM warehouses WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
        [ids],
      )
    ).rows.map((x) => x.id as string);
    if (
      ids.some(
        (id) =>
          !allowed(
            grants,
            write ? "outbound.create" : "outbound.read",
            id,
            known,
          ),
      )
    )
      throw new AuthError("FORBIDDEN", 403);
    return o;
  }
  private async replay(
    c: PoolClient,
    s: Session,
    key: string,
    operation: string,
    hash: string,
  ) {
    if (!uuid(key)) throw new CatalogError(400, "INVALID_INPUT");
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,74004))", [
      s.user_id + ":" + key,
    ]);
    const r = (
      await c.query(
        "SELECT * FROM command_results WHERE actor_id=$1 AND key=$2",
        [s.user_id, key],
      )
    ).rows[0];
    if (r && (r.operation !== operation || r.payload_hash !== hash))
      throw new CatalogError(409, "CONFLICT");
    return r?.result;
  }
  private async remember(
    c: PoolClient,
    s: Session,
    key: string,
    operation: string,
    hash: string,
    result: unknown,
  ) {
    await c.query(
      "INSERT INTO command_results(actor_id,key,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5)",
      [s.user_id, key, operation, hash, JSON.stringify(result)],
    );
  }
  async registerTemplate(
    ctx: Context,
    key: string,
    input: {
      code: string;
      kind: DocumentKind;
      version: number;
      definition: SampleTemplateDefinition;
    },
  ) {
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(input.code) ||
      !["instruction", "manifest"].includes(input.kind) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      input.version > 2147483647 ||
      !validTemplateDefinition(input.definition)
    )
      throw new CatalogError(400, "INVALID_INPUT");
    return this.run(ctx, true, async (c, s) => {
      const grants = await this.auth.grants(c, s.user_id!);
      if (!allowed(grants, "settings.manage"))
        throw new AuthError("FORBIDDEN", 403);
      if (!recentReauth(s.reauthenticated_at))
        throw new AuthError("REAUTH_REQUIRED", 403);
      const hash = documentHash(input),
        op = "documents.template";
      const old = await this.replay(c, s, key, op, hash);
      if (old) return old as { id: string; version: number };
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,74005))",
        [input.code],
      );
      let t = (
        await c.query(
          "SELECT * FROM document_templates WHERE code=$1 FOR UPDATE",
          [input.code],
        )
      ).rows[0];
      if (!t) {
        if (input.version !== 1) throw new CatalogError(409, "CONFLICT");
        t = { id: randomUUID(), kind: input.kind, active: true };
        await c.query(
          "INSERT INTO document_templates(id,code,kind,created_by) VALUES($1,$2,$3,$4)",
          [t.id, input.code, input.kind, s.user_id],
        );
      }
      if (!t.active || t.kind !== input.kind)
        throw new CatalogError(409, "CONFLICT");
      const max = (
        await c.query(
          "SELECT coalesce(max(version),0) AS version FROM document_template_versions WHERE template_id=$1",
          [t.id],
        )
      ).rows[0].version;
      if (input.version !== max + 1) throw new CatalogError(409, "CONFLICT");
      const canonical = canonicalPayload(input.definition),
        sha = documentHash(input.definition);
      await c.query(
        "INSERT INTO document_template_versions(template_id,version,definition,canonical,sha256,created_by) VALUES($1,$2,$3,$4,$5,$6)",
        [t.id, input.version, canonical, canonical, sha, s.user_id],
      );
      const result = { id: t.id as string, version: input.version };
      await this.auth.audit(
        c,
        s.user_id,
        "documents.template_registered",
        t.id,
        "CREATED",
        ctx.requestId,
        undefined,
        { version: input.version, sha256: sha },
      );
      await this.remember(c, s, key, op, hash, result);
      return result;
    });
  }
  async recordSnapshot(
    ctx: Context,
    key: string,
    input: RecordDocumentInput,
  ): Promise<DocumentReference> {
    if (
      !uuid(input.outboundId) ||
      !uuid(input.templateId) ||
      !version(input.outboundVersion) ||
      !Number.isSafeInteger(input.templateVersion) ||
      input.templateVersion < 1 ||
      input.templateVersion > 2147483647 ||
      !["ja", "ko", "en"].includes(input.locale)
    )
      throw new CatalogError(400, "INVALID_INPUT");
    return this.run(ctx, true, async (c, s) => {
      // Same actor/key lock namespace as Catalog/Inventory; current authority precedes replay.
      if (!uuid(key)) throw new CatalogError(400, "INVALID_INPUT");
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,74004))",
        [s.user_id + ":" + key],
      );
      const o = await this.scope(c, s, input.outboundId, true),
        hash = documentHash(input),
        op = "documents.snapshot";
      const old = await this.replay(c, s, key, op, hash);
      if (old) return old as DocumentReference;
      if (o.version !== input.outboundVersion)
        throw new CatalogError(409, "CONFLICT");
      const t = (
        await c.query(
          `SELECT t.kind,t.active,v.* FROM document_template_versions v JOIN document_templates t ON t.id=v.template_id WHERE t.id=$1 AND v.version=$2 FOR SHARE OF t,v`,
          [input.templateId, input.templateVersion],
        )
      ).rows[0];
      if (!t || !t.active) throw new CatalogError(404, "NOT_FOUND");
      if (
        !validTemplateDefinition(t.definition) ||
        documentHash(t.definition) !== t.sha256
      )
        throw new CatalogError(409, "CONFLICT");
      const template: DocumentTemplateVersion = {
        templateId: t.template_id,
        version: t.version,
        kind: t.kind,
        definition: t.definition,
        sha256: t.sha256,
        sample: true,
      };
      const id = randomUUID(),
        snapshot = await this.builder.build(c, {
          documentId: id,
          actorId: s.user_id!,
          outboundId: input.outboundId,
          outboundVersion: input.outboundVersion,
          template,
          locale: input.locale,
        }),
        canonical = canonicalPayload(snapshot),
        sha = documentHash(snapshot);
      if (Buffer.byteLength(canonical) > 2 * 1024 * 1024)
        throw new CatalogError(413, "INVALID_INPUT");
      const content = (
        await c.query(
          "SELECT (coalesce(max(content_version),0)+1)::text AS value FROM documents WHERE outbound_id=$1",
          [input.outboundId],
        )
      ).rows[0].value as string;
      await c.query(
        "INSERT INTO documents(id,outbound_id,outbound_version,content_version,template_id,template_version,locale,snapshot,canonical,snapshot_sha256,created_by,idempotency_key,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        [
          id,
          input.outboundId,
          input.outboundVersion,
          content,
          input.templateId,
          input.templateVersion,
          input.locale,
          canonical,
          canonical,
          sha,
          s.user_id,
          key,
          hash,
        ],
      );
      for (const line of snapshot.lines)
        await c.query(
          "INSERT INTO document_lines(id,document_id,outbound_id,outbound_line_id,sku_id,snapshot) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            id,
            input.outboundId,
            line.id,
            line.skuId,
            JSON.stringify(line),
          ],
        );
      for (const source of snapshot.sources)
        await c.query(
          "INSERT INTO document_sources(id,document_id,outbound_line_id,reservation_id,shipment_line_id,snapshot) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            id,
            source.lineId,
            source.reservationId,
            source.shipmentLineId,
            JSON.stringify(source),
          ],
        );
      for (const format of ["xlsx", "pdf"]) {
        const a = randomUUID();
        await c.query(
          "INSERT INTO document_artifacts(id,document_id,format,storage_key) VALUES($1,$2,$3,$4)",
          [a, id, format, a + "." + format],
        );
      }
      await c.query(
        "INSERT INTO document_events(id,document_id,sequence,event,actor_id,request_id) VALUES($1,$2,1,'snapshot_created',$3,$4)",
        [randomUUID(), id, s.user_id, ctx.requestId],
      );
      await this.auth.audit(
        c,
        s.user_id,
        "documents.snapshot_recorded",
        id,
        "PENDING_RENDER",
        ctx.requestId,
        undefined,
        { snapshotSha256: sha, outboundVersion: input.outboundVersion },
      );
      const result: DocumentReference = {
        documentId: id,
        outboundId: input.outboundId,
        outboundVersion: input.outboundVersion,
        templateId: input.templateId,
        templateVersion: input.templateVersion,
        snapshotSha256: sha,
        contentVersion: content,
        sample: true,
        dispatchable: false,
      };
      await this.remember(c, s, key, op, hash, result);
      return result;
    });
  }
  async read(
    ctx: Context,
    id: string,
  ): Promise<{
    snapshot: OutboundDocumentSnapshot;
    state: string;
    stale: boolean;
    artifacts: Record<string, unknown>[];
  }> {
    if (!uuid(id)) throw new CatalogError(400, "INVALID_INPUT");
    return this.run(ctx, false, async (c, s) => {
      const d = (await c.query("SELECT * FROM documents WHERE id=$1", [id]))
        .rows[0];
      if (!d) throw new CatalogError(404, "NOT_FOUND");
      const o = await this.scope(c, s, d.outbound_id, false);
      if (
        createHash("sha256").update(d.canonical).digest("hex") !==
          d.snapshot_sha256 ||
        canonicalPayload(d.snapshot) !== d.canonical
      )
        throw new AuthError("SERVICE_UNAVAILABLE", 503);
      let stale = o.version !== d.outbound_version;
      if (!stale) {
        const t = (
          await c.query(
            "SELECT t.active,t.kind,v.* FROM document_templates t JOIN document_template_versions v ON v.template_id=t.id WHERE t.id=$1 AND v.version=$2 FOR SHARE OF t,v",
            [d.template_id, d.template_version],
          )
        ).rows[0];
        if (!t) throw new AuthError("SERVICE_UNAVAILABLE", 503);
        stale = !t.active;
        if (!stale) {
          const current = await this.builder.build(c, {
            documentId: d.id,
            actorId: d.created_by,
            outboundId: d.outbound_id,
            outboundVersion: o.version,
            locale: d.locale,
            template: {
              templateId: t.template_id,
              version: t.version,
              kind: t.kind,
              definition: t.definition,
              sha256: t.sha256,
              sample: true,
            },
          });
          const source = (snapshot: OutboundDocumentSnapshot) => ({
            outbound: snapshot.outbound,
            lines: snapshot.lines,
            sources: snapshot.sources,
          });
          stale =
            documentHash(source(current)) !== documentHash(source(d.snapshot));
          if (!stale)
            stale =
              (
                await c.query(
                  "SELECT 1 FROM outbound_lines l JOIN skus s ON s.id=l.sku_id JOIN products p ON p.id=s.product_id WHERE l.outbound_id=$1 AND (s.status<>'active' OR p.status<>'active') UNION ALL SELECT 1 FROM warehouses WHERE id=ANY($2::uuid[]) AND status<>'active' LIMIT 1",
                  [o.id, [o.source_warehouse_id, o.destination_warehouse_id]],
                )
              ).rowCount !== 0;
        }
      }
      const artifacts = (
        await c.query(
          "SELECT id,format,state,sha256,byte_size,revision FROM document_artifacts WHERE document_id=$1 ORDER BY format",
          [id],
        )
      ).rows;
      const state = artifacts.some((a) =>
        ["missing", "corrupt"].includes(a.state),
      )
        ? "quarantined"
        : artifacts.some((a) => a.state === "failed")
          ? "failed"
          : artifacts.length === 2 &&
              artifacts.every((a) => a.state === "ready")
            ? "ready"
            : artifacts.some((a) => ["staged", "ready"].includes(a.state))
              ? "rendering"
              : "pending";
      return {
        snapshot: d.snapshot,
        state,
        stale,
        artifacts,
      };
    });
  }
}
