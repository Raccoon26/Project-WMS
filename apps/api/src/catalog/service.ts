import {
  createHash,
  createHmac,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import type { PoolClient } from "pg";
import {
  canonicalPayload,
  normalizeCatalogCode,
  externalCode,
  validCatalogTransition,
} from "@wms/domain";
import { AuthService, AuthError } from "../auth/service.js";
import type { Context, Session } from "../auth/service.js";
import { allowed } from "../auth/policy.js";
import type { Permission } from "../auth/policy.js";
export class CatalogError extends Error {
  constructor(
    public status: number,
    public code:
      | "CONFLICT"
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_RELATION" = "INVALID_RELATION",
  ) {
    super(code);
  }
}
export type Entity =
  | "products"
  | "skus"
  | "warehouses"
  | "locations"
  | "integration_accounts"
  | "sku_mappings";
export type Input = Record<string, string | number | null>;
export interface ListQuery {
  limit?: string;
  cursor?: string;
  q?: string;
  status?: string;
  product_id?: string;
  provider?: string;
  account_id?: string;
  type?: string;
  sort?: string;
  order?: string;
}
export const definitions = {
  products: {
    read: "products.read",
    write: "products.write",
    sort: ["id", "name_ja", "status"],
    fields: ["name_ja", "name_ko", "name_en", "description", "status"],
  },
  skus: {
    read: "products.read",
    write: "products.write",
    sort: ["id", "code", "status"],
    fields: ["product_id", "code", "barcode", "status"],
  },
  warehouses: {
    read: "warehouses.read",
    write: "warehouses.manage",
    sort: ["id", "code", "name", "status"],
    fields: ["code", "name", "type", "status", "adapter_config_ref"],
  },
  locations: {
    read: "locations.read",
    write: "locations.manage",
    sort: ["id", "code", "name", "status"],
    fields: ["code", "name", "parent_id", "status"],
  },
  integration_accounts: {
    read: "mappings.read",
    write: "mappings.manage",
    sort: ["id", "name", "provider", "status"],
    fields: ["provider", "account_ref", "name", "status"],
  },
  sku_mappings: {
    read: "mappings.read",
    write: "mappings.manage",
    sort: ["id", "external_code", "status"],
    fields: [
      "account_id",
      "provider",
      "marketplace",
      "external_code",
      "status",
      "trust",
    ],
  },
} as const;
const hash = (v: unknown) =>
  createHash("sha256").update(canonicalPayload(v)).digest("hex");
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export class CatalogService {
  constructor(
    public auth: AuthService,
    private cursorKey: Buffer,
  ) {
    this.cursorKey = createHmac("sha256", cursorKey)
      .update("wms/catalog-cursor/v1")
      .digest();
  }
  async access(
    c: PoolClient,
    s: Session,
    ctx: Context,
    permission: Permission,
    warehouse?: string,
    shared = false,
    recent = false,
  ) {
    const grants = await this.auth.grants(c, s.user_id!);
    const scoped = grants
      .filter((g) => g.scope !== "global" && idPattern.test(g.scope))
      .map((g) => g.scope);
    const known = (
      await c.query(
        "SELECT id FROM warehouses WHERE id=$1 OR id=ANY($2::uuid[])",
        [warehouse ?? null, scoped],
      )
    ).rows.map((r) => r.id as string);
    const ok =
      allowed(grants, permission, warehouse, known) ||
      (!warehouse &&
        shared &&
        grants.some(
          (g) =>
            known.includes(g.scope) && allowed([g], permission, g.scope, known),
        ));
    if (!ok) throw new AuthError("FORBIDDEN", 403);
    if (recent) await this.auth.require(c, s, permission, ctx, true);
    return { grants, known };
  }
  async execute<T>(
    ctx: Context,
    fn: (c: PoolClient, s: Session) => Promise<T>,
    write = false,
  ): Promise<T> {
    if (write) await this.auth.rate("mutation-ip", ctx.ip, 100, 60);
    try {
      return await this.auth.tx(async (c) => {
        // Same lock order as security mutations: revocation and a write cannot cross.
        if (write) await c.query("SELECT pg_advisory_xact_lock(74002)");
        const s = await this.auth.readSession(c, ctx);
        if (write) this.auth.csrf(ctx, s);
        return fn(c, s);
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "23505") throw new CatalogError(409, "CONFLICT");
      if (code === "23503" || code === "23514") throw new CatalogError(422);
      throw e;
    }
  }
  async resolve(c: PoolClient, entity: Entity, id: string) {
    const r = (await c.query(`SELECT * FROM ${entity} WHERE id=$1`, [id]))
      .rows[0];
    if (!r) throw new CatalogError(404, "NOT_FOUND");
    return r;
  }
  async scope(
    c: PoolClient,
    entity: Entity,
    id?: string,
    parent?: string,
  ): Promise<string | undefined> {
    if (entity === "locations")
      return parent ?? (await this.resolve(c, entity, id!)).warehouse_id;
    if (entity === "warehouses") return id;
    return undefined;
  }
  cursorEncode(data: unknown) {
    const text = Buffer.from(JSON.stringify(data)).toString("base64url");
    return (
      text +
      "." +
      createHmac("sha256", this.cursorKey).update(text).digest("base64url")
    );
  }
  cursorDecode(
    cursor: string,
    fingerprint: string,
  ): { value: string; id: string } {
    try {
      const [text, sig, ...rest] = cursor.split(".");
      if (!text || !sig || rest.length || cursor.length > 2500) throw 0;
      const expected = createHmac("sha256", this.cursorKey)
        .update(text)
        .digest();
      const actual = Buffer.from(sig, "base64url");
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw 0;
      const data = JSON.parse(Buffer.from(text, "base64url").toString());
      if (
        data.fingerprint !== fingerprint ||
        typeof data.value !== "string" ||
        data.value.length > 200 ||
        !idPattern.test(data.id)
      )
        throw 0;
      return data;
    } catch {
      throw new CatalogError(400, "INVALID_INPUT");
    }
  }
  async list(ctx: Context, entity: Entity, q: ListQuery, parent?: string) {
    return this.execute(ctx, async (c, s) => {
      const { grants } = await this.access(
        c,
        s,
        ctx,
        definitions[entity].read,
        entity === "locations" ? parent : undefined,
        entity !== "locations",
      );
      const limit = Number(q.limit ?? 25);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new CatalogError(400, "INVALID_INPUT");
      const sort = q.sort ?? "id",
        order = q.order ?? "asc";
      if (
        !(definitions[entity].sort as readonly string[]).includes(sort) ||
        !["asc", "desc"].includes(order)
      )
        throw new CatalogError(400, "INVALID_INPUT");
      const values: unknown[] = [],
        where: string[] = [];
      const bind = (v: unknown) => {
        values.push(v);
        return "$" + values.length;
      };
      if (entity === "warehouses" && !allowed(grants, "warehouses.read"))
        where.push(
          `t.id=ANY(${bind(grants.filter((g) => g.permission === "warehouses.read" && g.policyVersion === 1).map((g) => g.scope))}::uuid[])`,
        );
      if (parent)
        where.push(
          `t.${entity === "locations" ? "warehouse_id" : "sku_id"}=${bind(parent)}`,
        );
      if (q.status) where.push("t.status=" + bind(q.status));
      if (q.product_id) {
        if (entity !== "skus") throw new CatalogError(400, "INVALID_INPUT");
        where.push("t.product_id=" + bind(q.product_id));
      }
      if (q.type) {
        if (entity !== "warehouses")
          throw new CatalogError(400, "INVALID_INPUT");
        where.push("t.type=" + bind(q.type));
      }
      if (q.provider) {
        if (!["sku_mappings", "integration_accounts"].includes(entity))
          throw new CatalogError(400, "INVALID_INPUT");
        where.push("t.provider=" + bind(q.provider));
      }
      if (q.account_id) {
        if (entity !== "sku_mappings")
          throw new CatalogError(400, "INVALID_INPUT");
        where.push("t.account_id=" + bind(q.account_id));
      }
      if (q.q) {
        const term = bind("%" + q.q.replace(/[\\%_]/g, "\\$&") + "%");
        const search: Record<Entity, string> = {
          products: `(t.name_ja ILIKE ${term} OR t.name_ko ILIKE ${term} OR t.name_en ILIKE ${term})`,
          skus: `(t.code ILIKE ${term} OR t.barcode ILIKE ${term} OR EXISTS(SELECT 1 FROM sku_mappings m WHERE m.sku_id=t.id AND m.external_code ILIKE ${term}))`,
          warehouses: `(t.code ILIKE ${term} OR t.name ILIKE ${term})`,
          locations: `(t.code ILIKE ${term} OR t.name ILIKE ${term})`,
          integration_accounts: `(t.name ILIKE ${term} OR t.account_ref ILIKE ${term})`,
          sku_mappings: `t.external_code ILIKE ${term}`,
        };
        where.push(search[entity]);
      }
      const fingerprint = hash({
        entity,
        parent: parent ?? null,
        user: s.user_id,
        grants: grants.map((g) => canonicalPayload(g)).sort(),
        q: { ...q, cursor: null, sort, order },
      });
      if (q.cursor) {
        const last = this.cursorDecode(q.cursor, fingerprint);
        const cmp = order === "asc" ? ">" : "<";
        where.push(
          `(t.${sort},t.id)${cmp}(${bind(last.value)},${bind(last.id)}::uuid)`,
        );
      }
      const rows = (
        await c.query(
          `SELECT t.*${entity === "skus" ? ",p.name_ja AS product_name, (t.status='active' AND p.status='active') AS catalog_active" : ""} FROM ${entity} t ${entity === "skus" ? "JOIN products p ON p.id=t.product_id" : ""} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY t.${sort} ${order},t.id ${order} LIMIT ${bind(limit + 1)}`,
          values,
        )
      ).rows;
      const more = rows.length > limit;
      rows.splice(limit);
      const last = rows.at(-1);
      return {
        items: rows,
        nextCursor: more
          ? this.cursorEncode({
              fingerprint,
              value: String(last[sort]),
              id: last.id,
            })
          : null,
        asOf: new Date().toISOString(),
      };
    });
  }
  async get(ctx: Context, entity: Entity, id: string) {
    return this.execute(ctx, async (c, s) => {
      const warehouse = await this.scope(c, entity, id);
      await this.access(
        c,
        s,
        ctx,
        definitions[entity].read,
        warehouse,
        entity !== "warehouses" && entity !== "locations",
      );
      const row = await this.resolve(c, entity, id);
      if (entity === "skus")
        row.catalog_active =
          row.status === "active" &&
          (await this.resolve(c, "products", row.product_id)).status ===
            "active";
      return row;
    });
  }
  async change(
    ctx: Context,
    entity: Entity,
    input: Input,
    key: string | undefined,
    id?: string,
    parent?: string,
  ) {
    return this.execute(
      ctx,
      async (c, s) => {
        const warehouse = await this.scope(c, entity, id, parent);
        await this.access(
          c,
          s,
          ctx,
          definitions[entity].write,
          warehouse,
          false,
          entity === "sku_mappings" || entity === "integration_accounts",
        );
        if (!id && (!key || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)))
          throw new CatalogError(400, "INVALID_INPUT");
        if (key && !/^[A-Za-z0-9._:-]{8,128}$/.test(key))
          throw new CatalogError(400, "INVALID_INPUT");
        const operation =
            entity + ":" + (id ?? "create") + ":" + (parent ?? "global"),
          payloadHash = hash({ operation, input });
        if (key) {
          const existing = (
            await c.query(
              "SELECT operation,payload_hash,result FROM command_results WHERE actor_id=$1 AND key=$2",
              [s.user_id, key],
            )
          ).rows[0];
          if (existing) {
            if (
              existing.operation !== operation ||
              existing.payload_hash !== payloadHash
            )
              throw new CatalogError(409, "CONFLICT");
            return existing.result;
          }
        }
        const old = id ? await this.resolve(c, entity, id) : undefined;
        if (old && input.version !== old.version)
          throw new CatalogError(409, "CONFLICT");
        const data: Input = {};
        for (const field of definitions[entity].fields)
          if (input[field] !== undefined) data[field] = input[field]!;
        for (const field of [
          "name_ja",
          "name_ko",
          "name_en",
          "name",
          "description",
        ]) {
          if (typeof data[field] === "string") {
            data[field] = (data[field] as string).trim();
            if (!data[field] && field !== "description")
              throw new CatalogError(400, "INVALID_INPUT");
          }
        }
        if (typeof data.code === "string")
          data.code = normalizeCatalogCode(data.code);
        if (typeof data.external_code === "string")
          data.external_code = externalCode(data.external_code);
        if (
          old &&
          data.status &&
          (entity === "products" || entity === "skus") &&
          !validCatalogTransition(old.status, String(data.status))
        )
          throw new CatalogError(422);
        if (
          entity === "integration_accounts" &&
          old &&
          ["provider", "account_ref"].some(
            (k) => data[k] !== undefined && data[k] !== old[k],
          )
        )
          throw new CatalogError(422);
        if (entity === "skus") {
          const product = await this.resolve(
            c,
            "products",
            String(data.product_id ?? old?.product_id),
          );
          if (!old && product.status !== "active") throw new CatalogError(422);
          if (old && data.product_id && data.product_id !== old.product_id)
            throw new CatalogError(422);
        }
        if (entity === "locations") {
          const w = await this.resolve(c, "warehouses", warehouse!);
          await c.query("SELECT id FROM warehouses WHERE id=$1 FOR UPDATE", [
            warehouse,
          ]);
          if (w.status !== "active" && (!old || data.status === "active"))
            throw new CatalogError(422);
          data.warehouse_id = warehouse!;
        }
        let target = id ?? randomUUID();
        if (entity === "sku_mappings") {
          const skuId = parent ?? old.sku_id,
            sku = await this.resolve(c, "skus", skuId),
            product = await this.resolve(c, "products", sku.product_id);
          const account = await this.resolve(
            c,
            "integration_accounts",
            String(data.account_id ?? old?.account_id),
          );
          if (account.provider !== (data.provider ?? old?.provider))
            throw new CatalogError(422);
          if (
            (!old || data.external_code || data.trust === "local_reviewed") &&
            (sku.status !== "active" ||
              product.status !== "active" ||
              account.status !== "active")
          )
            throw new CatalogError(422);
          if (old && old.status === "inactive")
            throw new CatalogError(409, "CONFLICT");
          const replace =
            old &&
            ["account_id", "provider", "marketplace", "external_code"].some(
              (k) => data[k] !== undefined && data[k] !== old[k],
            );
          if (replace) {
            await c.query(
              "UPDATE sku_mappings SET status='inactive',valid_to=now(),version=version+1,updated_by=$2,updated_at=now() WHERE id=$1",
              [id, s.user_id],
            );
            const closed = await this.resolve(c, "sku_mappings", id!);
            await c.query(
              "INSERT INTO catalog_revisions(id,entity,entity_id,version,actor_id,snapshot) VALUES($1,$2,$3,$4,$5,$6)",
              [
                randomUUID(),
                entity,
                id,
                closed.version,
                s.user_id,
                JSON.stringify(closed),
              ],
            );
            await this.auth.audit(
              c,
              s.user_id,
              "sku_mappings.ended",
              id!,
              "SUCCESS",
              ctx.requestId,
              canonicalPayload(old),
              canonicalPayload(closed),
            );
            for (const k of definitions.sku_mappings.fields)
              if (data[k] === undefined) data[k] = old[k];
            target = randomUUID();
            data.replaces_id = id!;
            data.status = "active";
            data.trust = "unverified";
          }
          data.sku_id = skuId;
          const version = target === id ? old.version + 1 : 1;
          const trust = data.trust ?? old?.trust ?? "unverified";
          if (trust === "local_reviewed" && data.status !== "inactive")
            Object.assign(data, {
              reviewed_by: s.user_id,
              reviewed_at: new Date().toISOString(),
              evidence_source: "local_manual",
              evidence_version: version,
            });
          else
            Object.assign(data, {
              trust: "unverified",
              reviewed_by: null,
              reviewed_at: null,
              evidence_source: null,
              evidence_version: null,
            });
          if (data.status === "inactive") {
            data.valid_to = new Date().toISOString();
            if (old?.trust === "local_reviewed")
              Object.assign(data, {
                trust: old.trust,
                reviewed_by: old.reviewed_by,
                reviewed_at: old.reviewed_at.toISOString(),
                evidence_source: old.evidence_source,
                evidence_version: old.evidence_version,
              });
          }
        }
        const columns = Object.keys(data),
          values: unknown[] = Object.values(data);
        let result;
        if (old && target === id) {
          values.push(s.user_id, id, input.version);
          result = (
            await c.query(
              `UPDATE ${entity} SET ${columns.map((col, i) => col + "=$" + (i + 1)).join(",")},version=version+1,updated_at=now(),updated_by=$${values.length - 2} WHERE id=$${values.length - 1} AND version=$${values.length} RETURNING *`,
              values,
            )
          ).rows[0];
          if (!result) throw new CatalogError(409, "CONFLICT");
        } else {
          columns.push("id", "created_by", "updated_by");
          values.push(target, s.user_id, s.user_id);
          result = (
            await c.query(
              `INSERT INTO ${entity}(${columns.join(",")}) VALUES(${values.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`,
              values,
            )
          ).rows[0];
        }
        await c.query(
          "INSERT INTO catalog_revisions(id,entity,entity_id,version,actor_id,snapshot) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            entity,
            target,
            result.version,
            s.user_id,
            JSON.stringify(result),
          ],
        );
        await this.auth.audit(
          c,
          s.user_id,
          entity + (old ? ".updated" : ".created"),
          target,
          "SUCCESS",
          ctx.requestId,
          old ? canonicalPayload(old) : undefined,
          canonicalPayload(result),
        );
        if (key)
          await c.query(
            "INSERT INTO command_results(actor_id,key,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5)",
            [s.user_id, key, operation, payloadHash, JSON.stringify(result)],
          );
        return result;
      },
      true,
    );
  }
  async history(
    ctx: Context,
    entity: Entity,
    id: string,
    limit = 25,
    before = 2147483647,
  ) {
    return this.execute(ctx, async (c, s) => {
      const warehouse = await this.scope(c, entity, id);
      await this.access(
        c,
        s,
        ctx,
        definitions[entity].read,
        warehouse,
        entity !== "warehouses" && entity !== "locations",
      );
      await this.resolve(c, entity, id);
      const items = (
        await c.query(
          "SELECT id,entity_id,version,actor_id,snapshot,occurred_at FROM catalog_revisions WHERE entity=$1 AND entity_id=$2 AND version<$3 ORDER BY version DESC LIMIT $4",
          [entity, id, before, limit + 1],
        )
      ).rows;
      const more = items.length > limit;
      items.splice(limit);
      return {
        items,
        nextCursor: more ? String(items.at(-1).version) : null,
        asOf: new Date().toISOString(),
      };
    });
  }
  async warehouseRoles(
    ctx: Context,
    user: string,
    warehouse: string,
    codes: string[],
  ) {
    return this.auth.mutate(
      ctx,
      async (c, s) => {
        if (
          user === s.user_id ||
          codes.includes("Administrator") ||
          new Set(codes).size !== codes.length
        )
          throw new AuthError("FORBIDDEN", 403);
        await this.resolve(c, "warehouses", warehouse);
        if (
          !(
            await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user])
          ).rowCount
        )
          throw new CatalogError(404, "NOT_FOUND");
        const selected = (
          await c.query(
            "SELECT id,code FROM roles WHERE code=ANY($1::text[]) AND active",
            [codes],
          )
        ).rows;
        if (selected.length !== codes.length)
          throw new CatalogError(400, "INVALID_INPUT");
        const before = (
          await c.query(
            "SELECT role_id FROM user_roles WHERE user_id=$1 AND warehouse_id=$2 AND revoked_at IS NULL",
            [user, warehouse],
          )
        ).rows;
        await c.query(
          "UPDATE user_roles SET revoked_at=now() WHERE user_id=$1 AND warehouse_id=$2 AND revoked_at IS NULL",
          [user, warehouse],
        );
        for (const role of selected)
          await c.query(
            "INSERT INTO user_roles(id,user_id,role_id,scope,warehouse_id,granted_by) VALUES($1,$2,$3,'warehouse',$4,$5)",
            [randomUUID(), user, role.id, warehouse, s.user_id],
          );
        await this.auth.audit(
          c,
          s.user_id,
          "warehouse.roles.changed",
          user,
          "SUCCESS",
          ctx.requestId,
          { warehouse, roles: before },
          { warehouse, roles: codes },
        );
        return { id: user, warehouse_id: warehouse, roles: codes };
      },
      "roles.manage",
    );
  }
  async grants(ctx: Context, user: string) {
    return this.execute(ctx, async (c, s) => {
      await this.auth.require(c, s, "roles.read", ctx);
      return {
        items: (
          await c.query(
            "SELECT ur.id,r.code,ur.scope,ur.warehouse_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND ur.revoked_at IS NULL ORDER BY ur.id LIMIT 100",
            [user],
          )
        ).rows,
      };
    });
  }
}
