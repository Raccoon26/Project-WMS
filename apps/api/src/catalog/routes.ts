import type { FastifyInstance } from "fastify";
import { CatalogService } from "./service.js";
import type { Entity, Input, ListQuery } from "./service.js";
import { AuthService } from "../auth/service.js";
import { authContext } from "../auth/routes.js";
import type { AuthOptions } from "../auth/routes.js";
import { encryptionKey } from "../auth/crypto.js";
const object = (
  properties: Record<string, unknown>,
  required: string[] = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });
const str = (maxLength = 200) => ({
  type: "string",
  minLength: 1,
  maxLength,
  pattern: "^[^\\u0000]*$",
});
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const uuid = {
  type: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
};
const status = { enum: ["active", "inactive", "discontinued"] };
const simpleStatus = { enum: ["active", "inactive"] };
const version = { type: "integer", minimum: 1, maximum: 2147483646 };
const fields: Record<Entity, Record<string, unknown>> = {
  products: {
    name_ja: str(),
    name_ko: nullable(str()),
    name_en: nullable(str()),
    description: nullable(str(2000)),
    status,
  },
  skus: {
    product_id: uuid,
    code: str(66),
    barcode: nullable({ type: "string", pattern: "^[0-9]{8,14}$" }),
    status,
  },
  warehouses: {
    code: str(66),
    name: str(),
    type: { enum: ["external_email", "internal", "fba", "rsl"] },
    status: simpleStatus,
    adapter_config_ref: nullable({
      type: "string",
      pattern: "^[a-zA-Z0-9._-]{1,100}$",
    }),
  },
  locations: {
    code: str(66),
    name: str(),
    parent_id: nullable(uuid),
    status: simpleStatus,
  },
  integration_accounts: {
    provider: { enum: ["amazon", "rakuten"] },
    account_ref: { type: "string", pattern: "^[a-zA-Z0-9._-]{1,100}$" },
    name: str(),
    status: simpleStatus,
  },
  sku_mappings: {
    account_id: uuid,
    provider: { enum: ["amazon", "rakuten"] },
    marketplace: { enum: ["JP"] },
    external_code: { type: "string", pattern: "^[!-~]{1,100}$" },
    status: simpleStatus,
    trust: { enum: ["unverified", "local_reviewed"] },
  },
};
const required: Record<Entity, string[]> = {
  products: ["name_ja"],
  skus: ["product_id", "code"],
  warehouses: ["code", "name", "type"],
  locations: ["code", "name"],
  integration_accounts: ["provider", "account_ref", "name"],
  sku_mappings: ["account_id", "provider", "marketplace", "external_code"],
};
const query = object(
  {
    limit: { type: "string", pattern: "^([1-9][0-9]?|100)$" },
    cursor: str(2500),
    q: str(100),
    status,
    sort: str(32),
    order: { enum: ["asc", "desc"] },
    product_id: uuid,
    account_id: uuid,
    provider: { enum: ["amazon", "rakuten"] },
    type: { enum: ["external_email", "internal", "fba", "rsl"] },
  },
  [],
);
export function registerCatalog(
  app: FastifyInstance,
  options: AuthOptions | undefined,
) {
  if (!options) return;
  const service = new CatalogService(
    new AuthService(options.pool, encryptionKey(options.key), options.origin),
    encryptionKey(options.key),
  );
  const paths: Record<Entity, string> = {
    products: "products",
    skus: "skus",
    warehouses: "warehouses",
    locations: "locations",
    integration_accounts: "integration-accounts",
    sku_mappings: "mappings",
  };
  for (const entity of Object.keys(paths) as Entity[]) {
    const nested = entity === "locations" || entity === "sku_mappings";
    const list =
      "/api/v1/" +
      (entity === "locations"
        ? "warehouses/:parent/locations"
        : entity === "sku_mappings"
          ? "skus/:parent/mappings"
          : paths[entity]);
    const detail = "/api/v1/" + paths[entity] + "/:id";
    const params = object({ [nested ? "parent" : "id"]: uuid });
    app.get<{ Querystring: ListQuery; Params: { parent?: string } }>(
      list,
      {
        config: { wmsCatalog: true },
        schema: { querystring: query, ...(nested ? { params } : {}) },
      },
      (req) =>
        service.list(authContext(req), entity, req.query, req.params.parent),
    );
    if (!nested)
      app.get<{ Params: { id: string } }>(
        detail,
        {
          config: { wmsCatalog: true },
          schema: { params: object({ id: uuid }) },
        },
        (req) => service.get(authContext(req), entity, req.params.id),
      );
    app.post<{ Body: Input; Params: { parent?: string } }>(
      list,
      {
        config: { wmsCatalog: true },
        schema: {
          ...(nested ? { params } : {}),
          body: object(fields[entity], required[entity]),
        },
      },
      (req) =>
        service.change(
          authContext(req),
          entity,
          req.body,
          typeof req.headers["idempotency-key"] === "string"
            ? req.headers["idempotency-key"]
            : undefined,
          undefined,
          req.params.parent,
        ),
    );
    app.get<{
      Params: { id: string };
      Querystring: { limit?: string; before?: string };
    }>(
      detail + "/history",
      {
        config: { wmsCatalog: true },
        schema: {
          params: object({ id: uuid }),
          querystring: object(
            {
              limit: { type: "string", pattern: "^([1-9][0-9]?|100)$" },
              before: { type: "string", pattern: "^[1-9][0-9]{0,8}$" },
            },
            [],
          ),
        },
      },
      (req) =>
        service.history(
          authContext(req),
          entity,
          req.params.id,
          Number(req.query.limit ?? 25),
          Number(req.query.before ?? 2147483647),
        ),
    );
    app.patch<{ Body: Input; Params: { id: string } }>(
      detail,
      {
        config: { wmsCatalog: true },
        schema: {
          params: object({ id: uuid }),
          body: {
            ...object({ ...fields[entity], version }, ["version"]),
            minProperties: 2,
          },
        },
      },
      (req) =>
        service.change(
          authContext(req),
          entity,
          req.body,
          typeof req.headers["idempotency-key"] === "string"
            ? req.headers["idempotency-key"]
            : undefined,
          req.params.id,
        ),
    );
  }
  app.get<{ Params: { id: string } }>(
    "/api/v1/users/:id/grants",
    { config: { wmsCatalog: true }, schema: { params: object({ id: uuid }) } },
    (req) => service.grants(authContext(req), req.params.id),
  );
  app.put<{
    Params: { id: string };
    Body: { warehouse_id: string; roles: string[] };
  }>(
    "/api/v1/users/:id/warehouse-roles",
    {
      config: { wmsCatalog: true },
      schema: {
        params: object({ id: uuid }),
        body: object({
          warehouse_id: uuid,
          roles: {
            type: "array",
            maxItems: 4,
            uniqueItems: true,
            items: { enum: ["Manager", "Operator", "Viewer", "Auditor"] },
          },
        }),
      },
    },
    (req) =>
      service.warehouseRoles(
        authContext(req),
        req.params.id,
        req.body.warehouse_id,
        req.body.roles,
      ),
  );
  return service;
}
