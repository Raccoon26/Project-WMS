import type { FastifyInstance } from "fastify";
import { AuthService } from "../auth/service.js";
import { authContext } from "../auth/routes.js";
import type { AuthOptions } from "../auth/routes.js";
import { encryptionKey } from "../auth/crypto.js";
import { InventoryService } from "./service.js";
import type { InventoryCommand, InventoryQuery } from "./service.js";
const obj = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });
const uuid = {
  type: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
};
const text = (maxLength = 200) => ({
  type: "string",
  minLength: 1,
  maxLength,
  pattern: "^[^\\u0000]*$",
});
const qty = { type: "string", pattern: "^[1-9][0-9]{0,18}$" };
const version = { type: "string", pattern: "^[1-9][0-9]{0,18}$" };
const skuVersion = { type: "integer", minimum: 1, maximum: 2147483646 };
const evidence = {
  source: { enum: ["synthetic", "local_manual", "external"] },
  source_event_id: text(128),
  evidence_ref: text(128),
  reason: text(1000),
  occurred_at: { type: "string", format: "date-time" },
};
const sku = { sku_id: uuid, sku_version: skuVersion };
const line = obj({ ...sku, quantity: qty });
const planning = {
  business_ref: text(100),
  source_warehouse_id: uuid,
  destination_warehouse_id: uuid,
  lines: { type: "array", minItems: 1, maxItems: 100, items: line },
};
const count = {
  account_id: uuid,
  warehouse_id: uuid,
  observed: { type: "string", pattern: "^(0|[1-9][0-9]{0,18})$" },
  as_of: { type: "string", format: "date-time" },
};
export const inventoryCommands: Record<
  string,
  {
    path: string;
    fields: Record<string, unknown>;
    optional?: string[];
    method?: "PATCH";
  }
> = {
  opening: {
    path: "inventory/openings",
    fields: {
      ...evidence,
      ...sku,
      warehouse_id: uuid,
      location_id: uuid,
      quantity: qty,
    },
    optional: ["location_id"],
  },
  reclassify: {
    path: "inventory/reclassifications",
    fields: {
      ...evidence,
      ...sku,
      warehouse_id: uuid,
      location_id: uuid,
      quantity: qty,
      from_kind: { enum: ["good", "damaged", "quarantine"] },
      to_kind: { enum: ["good", "damaged", "quarantine"] },
    },
    optional: ["location_id"],
  },
  reverse: {
    path: "inventory/reversals",
    fields: { ...evidence, transaction_id: uuid },
  },
  adjustment: {
    path: "inventory/adjustments",
    fields: { ...evidence, ...count },
  },
  reconcile: { path: "reconciliations", fields: { ...evidence, ...count } },
  draft: { path: "outbounds", fields: planning },
  transfer: { path: "transfers", fields: planning },
  edit: {
    path: "outbounds/:id",
    fields: { version, lines: planning.lines },
    method: "PATCH",
  },
  reserve: { path: "outbounds/:id/reserve", fields: { version } },
  release: { path: "outbounds/:id/release", fields: { version } },
  cancel: { path: "outbounds/:id/cancel", fields: { version } },
  ship: {
    path: "outbounds/:id/shipments",
    fields: { ...evidence, ...sku, version, line_id: uuid, quantity: qty },
  },
  receive: {
    path: "inbounds/:id/receipts",
    fields: {
      ...evidence,
      ...sku,
      version,
      shipment_line_id: uuid,
      quantity: qty,
      condition: { enum: ["good", "damaged", "quarantine"] },
    },
  },
};
const readPaths: Record<string, string> = {
  inventory: "balances",
  "inventory/balances": "balances",
  "inventory/transactions": "transactions",
  reservations: "reservations",
  outbounds: "outbounds",
  inbounds: "inbounds",
  transfers: "transfers",
  reconciliations: "reconciliations",
};
export function registerInventory(
  app: FastifyInstance,
  options: AuthOptions | undefined,
) {
  if (!options) return;
  const key = encryptionKey(options.key),
    service = new InventoryService(
      new AuthService(options.pool, key, options.origin),
      key,
      options.syntheticInventory ?? false,
    );
  for (const [operation, route] of Object.entries(inventoryCommands))
    app.route<{ Body: InventoryCommand; Params: { id?: string } }>({
      method: route.method ?? "POST",
      url: "/api/v1/" + route.path,
      config: { wmsInventory: true },
      schema: {
        body: obj(
          route.fields,
          Object.keys(route.fields).filter((k) => !route.optional?.includes(k)),
        ),
        ...(route.path.includes(":id") ? { params: obj({ id: uuid }) } : {}),
      },
      handler: (req) =>
        service.command(
          authContext(req),
          operation,
          req.body,
          typeof req.headers["idempotency-key"] === "string"
            ? req.headers["idempotency-key"]
            : "",
          req.params.id,
        ),
    });
  for (const [path, entity] of Object.entries(readPaths))
    for (const detail of [false, true])
      app.get<{ Querystring: InventoryQuery; Params: { id?: string } }>(
        "/api/v1/" + path + (detail ? "/:id" : ""),
        {
          config: { wmsInventory: true },
          schema: {
            querystring: obj(
              {
                warehouse_id: uuid,
                sku_id: uuid,
                limit: { type: "string", pattern: "^([1-9][0-9]?|100)$" },
                cursor: text(2500),
                q: text(100),
                state: text(32),
              },
              [],
            ),
            ...(detail ? { params: obj({ id: uuid }) } : {}),
          },
        },
        (req) =>
          service.list(authContext(req), entity, req.query, req.params.id),
      );
  for (const [path, entity] of [
    ["outbounds/:id/shipments", "shipments"],
    ["inbounds/:id/receipts", "receipts"],
  ] as const)
    app.get<{ Params: { id: string }; Querystring: InventoryQuery }>(
      "/api/v1/" + path,
      {
        config: { wmsInventory: true },
        schema: {
          params: obj({ id: uuid }),
          querystring: obj(
            {
              limit: { type: "string", pattern: "^([1-9][0-9]?|100)$" },
              cursor: text(2500),
              sku_id: uuid,
              warehouse_id: uuid,
              q: text(100),
              state: text(32),
            },
            [],
          ),
        },
      },
      (req) => service.list(authContext(req), entity, req.query, req.params.id),
    );
  app.get<{ Querystring: InventoryQuery }>(
    "/api/v1/inventory/summary",
    {
      config: { wmsInventory: true },
      schema: {
        querystring: obj(
          {
            limit: { type: "string", pattern: "^([1-9][0-9]?|100)$" },
            cursor: text(2500),
            sku_id: uuid,
            warehouse_id: uuid,
            q: text(100),
            state: text(32),
          },
          [],
        ),
      },
    },
    (req) => service.list(authContext(req), "summary", req.query),
  );
}
