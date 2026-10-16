import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
  foreignKey,
  jsonb,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { users } from "./auth-schema.js";
const metadata = () => ({
  id: uuid("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  updatedBy: uuid("updated_by")
    .notNull()
    .references(() => users.id),
});
const state = (name: string) => text(name).notNull().default("active");
export const products = pgTable(
  "products",
  {
    ...metadata(),
    nameJa: text("name_ja").notNull(),
    nameKo: text("name_ko"),
    nameEn: text("name_en"),
    description: text("description"),
    status: state("status"),
  },
  (t) => [
    check(
      "products_names",
      sql`length(${t.nameJa}) BETWEEN 1 AND 200 AND (${t.nameKo} IS NULL OR length(${t.nameKo}) BETWEEN 1 AND 200) AND (${t.nameEn} IS NULL OR length(${t.nameEn}) BETWEEN 1 AND 200) AND (${t.description} IS NULL OR length(${t.description}) <= 2000)`,
    ),
    check(
      "products_state",
      sql`${t.status} IN ('active','inactive','discontinued') AND ${t.version}>0`,
    ),
    index("products_name_search").using(
      "gin",
      sql`${t.nameJa} public.gin_trgm_ops`,
    ),
    index("products_name_page").on(t.nameJa, t.id),
    index("products_status_page").on(t.status, t.id),
  ],
);
export const skus = pgTable(
  "skus",
  {
    ...metadata(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    code: text("code").notNull().unique(),
    barcode: text("barcode").unique(),
    status: state("status"),
  },
  (t) => [
    check("skus_code", sql`${t.code} ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$'`),
    check(
      "skus_barcode",
      sql`${t.barcode} IS NULL OR ${t.barcode} ~ '^[0-9]{8,14}$'`,
    ),
    check(
      "skus_state",
      sql`${t.status} IN ('active','inactive','discontinued') AND ${t.version}>0`,
    ),
    index("skus_code_search").using("gin", sql`${t.code} public.gin_trgm_ops`),
    index("skus_barcode_search").using(
      "gin",
      sql`${t.barcode} public.gin_trgm_ops`,
    ),
    index("skus_code_page").on(t.code, t.id),
    index("skus_product_page").on(t.productId, t.id),
    index("skus_status_page").on(t.status, t.id),
  ],
);
export const warehouses = pgTable(
  "warehouses",
  {
    ...metadata(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    status: state("status"),
    adapterConfigRef: text("adapter_config_ref"),
  },
  (t) => [
    check("warehouses_code", sql`${t.code} ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$'`),
    check(
      "warehouses_fields",
      sql`length(${t.name}) BETWEEN 1 AND 200 AND (${t.adapterConfigRef} IS NULL OR ${t.adapterConfigRef} ~ '^[a-zA-Z0-9._-]{1,100}$')`,
    ),
    check(
      "warehouses_state",
      sql`${t.status} IN ('active','inactive') AND ${t.version}>0 AND ${t.type} IN ('external_email','internal','fba','rsl')`,
    ),
    index("warehouses_code_page").on(t.code, t.id),
    index("warehouses_name_page").on(t.name, t.id),
    index("warehouses_type_page").on(t.type, t.id),
  ],
);
export const locations = pgTable(
  "locations",
  {
    ...metadata(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => locations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: state("status"),
  },
  (t) => [
    uniqueIndex("locations_identity").on(t.warehouseId, t.id),
    uniqueIndex("locations_code").on(t.warehouseId, t.code),
    foreignKey({
      name: "locations_parent_warehouse",
      columns: [t.warehouseId, t.parentId],
      foreignColumns: [t.warehouseId, t.id],
    }),
    check(
      "locations_fields",
      sql`${t.code} ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$' AND length(${t.name}) BETWEEN 1 AND 200 AND ${t.status} IN ('active','inactive') AND ${t.version}>0 AND (${t.parentId} IS NULL OR ${t.parentId}<>${t.id})`,
    ),
  ],
);
export const integrationAccounts = pgTable(
  "integration_accounts",
  {
    ...metadata(),
    provider: text("provider").notNull(),
    accountRef: text("account_ref").notNull(),
    name: text("name").notNull(),
    status: state("status"),
  },
  (t) => [
    uniqueIndex("integration_accounts_reference").on(t.provider, t.accountRef),
    uniqueIndex("integration_accounts_provider").on(t.id, t.provider),
    check(
      "integration_accounts_fields",
      sql`${t.provider} IN ('amazon','rakuten') AND ${t.accountRef} ~ '^[a-zA-Z0-9._-]{1,100}$' AND length(${t.name}) BETWEEN 1 AND 200 AND ${t.status} IN ('active','inactive') AND ${t.version}>0`,
    ),
  ],
);
export const skuMappings = pgTable(
  "sku_mappings",
  {
    ...metadata(),
    skuId: uuid("sku_id")
      .notNull()
      .references(() => skus.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => integrationAccounts.id),
    provider: text("provider").notNull(),
    marketplace: text("marketplace").notNull(),
    externalCode: text("external_code").notNull(),
    status: state("status"),
    trust: text("trust").notNull().default("unverified"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    evidenceSource: text("evidence_source"),
    evidenceVersion: integer("evidence_version"),
    validFrom: timestamp("valid_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    replacesId: uuid("replaces_id").references(
      (): AnyPgColumn => skuMappings.id,
    ),
  },
  (t) => [
    foreignKey({
      name: "sku_mappings_account_provider",
      columns: [t.accountId, t.provider],
      foreignColumns: [integrationAccounts.id, integrationAccounts.provider],
    }),
    uniqueIndex("sku_mappings_active_external")
      .on(t.accountId, t.provider, t.marketplace, t.externalCode)
      .where(sql`${t.status}='active'`),
    index("sku_mappings_code_search").using(
      "gin",
      sql`${t.externalCode} public.gin_trgm_ops`,
    ),
    index("sku_mappings_sku_page").on(t.skuId, t.id),
    index("sku_mappings_code_page").on(t.externalCode, t.id),
    check(
      "sku_mappings_fields",
      sql`${t.provider} IN ('amazon','rakuten') AND ${t.marketplace}='JP' AND length(${t.externalCode}) BETWEEN 1 AND 100 AND ${t.externalCode} ~ '^[!-~]+$' AND ${t.status} IN ('active','inactive') AND ${t.trust} IN ('unverified','local_reviewed') AND ${t.version}>0 AND ((${t.status}='active' AND ${t.validTo} IS NULL) OR (${t.status}='inactive' AND ${t.validTo} IS NOT NULL)) AND (${t.validTo} IS NULL OR ${t.validTo}>=${t.validFrom})`,
    ),
    check(
      "sku_mappings_review",
      sql`(${t.trust}='unverified' AND ${t.reviewedBy} IS NULL AND ${t.reviewedAt} IS NULL AND ${t.evidenceSource} IS NULL AND ${t.evidenceVersion} IS NULL) OR (${t.trust}='local_reviewed' AND ${t.reviewedBy} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL AND ${t.evidenceSource}='local_manual' AND ${t.evidenceVersion}<=${t.version} AND ${t.evidenceVersion}>0)`,
    ),
  ],
);
export const commandResults = pgTable(
  "command_results",
  {
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    key: text("key").notNull(),
    operation: text("operation").notNull(),
    payloadHash: text("payload_hash").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("command_results_actor_key").on(t.actorId, t.key),
    check(
      "command_results_fields",
      sql`length(${t.key}) BETWEEN 8 AND 128 AND length(${t.payloadHash})=64`,
    ),
  ],
);

export const catalogRevisions = pgTable(
  "catalog_revisions",
  {
    id: uuid("id").primaryKey(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    version: integer("version").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    snapshot: jsonb("snapshot").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("catalog_revisions_version").on(
      t.entity,
      t.entityId,
      t.version,
    ),
    check(
      "catalog_revisions_entity",
      sql`${t.entity} IN ('products','skus','warehouses','locations','integration_accounts','sku_mappings') AND ${t.version}>0`,
    ),
  ],
);
