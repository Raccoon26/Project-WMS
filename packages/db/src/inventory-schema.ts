import {
  pgTable,
  uuid,
  text,
  bigint,
  integer,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth-schema.js";
import { skus, warehouses, locations } from "./catalog-schema.js";
export const serviceActors = pgTable("service_actors", {
  id: uuid("id").primaryKey(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(false),
});
export const outbounds = pgTable("outbounds", {
  id: uuid("id").primaryKey(),
  businessRef: text("business_ref").notNull().unique(),
  sourceWarehouseId: uuid("source_warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  destinationWarehouseId: uuid("destination_warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  state: text("state").notNull().default("draft"),
  version: bigint("version", { mode: "bigint" })
    .notNull()
    .default(sql`1`),
  policyVersion: integer("policy_version").notNull().default(1),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const outboundLines = pgTable("outbound_lines", {
  id: uuid("id").primaryKey(),
  outboundId: uuid("outbound_id")
    .notNull()
    .references(() => outbounds.id),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => skus.id),
  requestedQty: bigint("requested_qty", { mode: "bigint" }).notNull(),
  shippedQty: bigint("shipped_qty", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  cancelledQty: bigint("cancelled_qty", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
});
export const inventoryEvidence = pgTable("inventory_evidence", {
  id: uuid("id").primaryKey(),
  source: text("source").notNull(),
  sourceEventId: text("source_event_id").notNull(),
  operation: text("operation").notNull(),
  scope: uuid("scope")
    .notNull()
    .references(() => warehouses.id),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => skus.id),
  quantity: bigint("quantity", { mode: "bigint" }).notNull(),
  reference: text("reference").notNull(),
  trust: text("trust").notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  payloadHash: text("payload_hash").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const shipments = pgTable("shipments", {
  id: uuid("id").primaryKey(),
  outboundId: uuid("outbound_id")
    .notNull()
    .references(() => outbounds.id),
  evidenceId: uuid("evidence_id")
    .notNull()
    .unique()
    .references(() => inventoryEvidence.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const shipmentLines = pgTable("shipment_lines", {
  id: uuid("id").primaryKey(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => shipments.id),
  outboundLineId: uuid("outbound_line_id")
    .notNull()
    .references(() => outboundLines.id),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => skus.id),
  shippedQty: bigint("shipped_qty", { mode: "bigint" }).notNull(),
  receivedQty: bigint("received_qty", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
});
export const inbounds = pgTable("inbounds", {
  id: uuid("id").primaryKey(),
  outboundId: uuid("outbound_id")
    .notNull()
    .unique()
    .references(() => outbounds.id),
  destinationWarehouseId: uuid("destination_warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  state: text("state").notNull().default("planned"),
  version: bigint("version", { mode: "bigint" })
    .notNull()
    .default(sql`1`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const inboundLines = pgTable("inbound_lines", {
  id: uuid("id").primaryKey(),
  inboundId: uuid("inbound_id")
    .notNull()
    .references(() => inbounds.id),
  outboundLineId: uuid("outbound_line_id")
    .notNull()
    .unique()
    .references(() => outboundLines.id),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => skus.id),
  expectedQty: bigint("expected_qty", { mode: "bigint" }).notNull(),
  receivedQty: bigint("received_qty", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
});
export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey(),
  inboundId: uuid("inbound_id")
    .notNull()
    .references(() => inbounds.id),
  evidenceId: uuid("evidence_id")
    .notNull()
    .unique()
    .references(() => inventoryEvidence.id),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const receiptLines = pgTable("receipt_lines", {
  id: uuid("id").primaryKey(),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => receipts.id),
  shipmentLineId: uuid("shipment_line_id")
    .notNull()
    .references(() => shipmentLines.id),
  quantity: bigint("quantity", { mode: "bigint" }).notNull(),
  condition: text("condition").notNull(),
});
export const inventoryAccounts = pgTable("inventory_accounts", {
  id: uuid("id").primaryKey(),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => skus.id),
  warehouseId: uuid("warehouse_id").references(() => warehouses.id),
  locationId: uuid("location_id").references(() => locations.id),
  shipmentId: uuid("shipment_id").references(() => shipments.id),
  kind: text("kind").notNull(),
  owner: text("owner").notNull().default("business"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const inventoryTransactions = pgTable("inventory_transactions", {
  id: uuid("id").primaryKey(),
  movementType: text("movement_type").notNull(),
  reason: text("reason").notNull(),
  referenceType: text("reference_type").notNull(),
  referenceId: uuid("reference_id").notNull(),
  actorId: uuid("actor_id").references(() => users.id),
  serviceActorId: uuid("service_actor_id").references(() => serviceActors.id),
  sourceSystem: text("source_system").notNull(),
  sourceEventId: text("source_event_id").notNull(),
  scope: uuid("scope")
    .notNull()
    .references(() => warehouses.id),
  idempotencyKey: text("idempotency_key").notNull(),
  payloadHash: text("payload_hash").notNull(),
  evidenceId: uuid("evidence_id")
    .notNull()
    .references(() => inventoryEvidence.id),
  reversesId: uuid("reverses_id").references(
    (): AnyPgColumn => inventoryTransactions.id,
  ),
  relatedTransactionId: uuid("related_transaction_id").references(
    (): AnyPgColumn => inventoryTransactions.id,
  ),
  requestId: text("request_id").notNull(),
  policyVersion: integer("policy_version").notNull().default(1),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  originXid: bigint("origin_xid", { mode: "bigint" })
    .notNull()
    .default(sql`txid_current()`),
});
export const inventoryEntries = pgTable("inventory_entries", {
  id: uuid("id").primaryKey(),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => inventoryTransactions.id),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => skus.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => inventoryAccounts.id),
  quantity: bigint("quantity", { mode: "bigint" }).notNull(),
  lineNo: integer("line_no").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
});
export const inventoryBalances = pgTable("inventory_balances", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => inventoryAccounts.id),
  quantity: bigint("quantity", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  reserved: bigint("reserved", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  version: bigint("version", { mode: "bigint" })
    .notNull()
    .default(sql`1`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const reservations = pgTable("reservations", {
  id: uuid("id").primaryKey(),
  outboundLineId: uuid("outbound_line_id")
    .notNull()
    .references(() => outboundLines.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => inventoryAccounts.id),
  quantity: bigint("quantity", { mode: "bigint" }).notNull(),
  consumed: bigint("consumed", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  released: bigint("released", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  version: bigint("version", { mode: "bigint" })
    .notNull()
    .default(sql`1`),
  status: text("status").notNull().default("active"),
});
export const transfers = pgTable("transfers", {
  id: uuid("id").primaryKey(),
  outboundId: uuid("outbound_id")
    .notNull()
    .unique()
    .references(() => outbounds.id),
  inboundId: uuid("inbound_id")
    .notNull()
    .unique()
    .references(() => inbounds.id),
});
export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: uuid("id").primaryKey(),
  source: text("source").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("held"),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const reconciliationItems = pgTable("reconciliation_items", {
  id: uuid("id").primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => reconciliationRuns.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => inventoryAccounts.id),
  expected: bigint("expected", { mode: "bigint" }).notNull(),
  observed: bigint("observed", { mode: "bigint" }).notNull(),
  difference: bigint("difference", { mode: "bigint" }).notNull(),
  evidenceRef: text("evidence_ref").notNull(),
  resolutionTransactionId: uuid("resolution_transaction_id").references(
    () => inventoryTransactions.id,
  ),
});
export const outbox = pgTable("outbox", {
  id: uuid("id").primaryKey(),
  actionKey: text("action_key").notNull().unique(),
  aggregateId: uuid("aggregate_id").notNull(),
  aggregateVersion: bigint("aggregate_version", { mode: "bigint" }).notNull(),
  topic: text("topic").notNull(),
  payload: jsonb("payload").notNull(),
  payloadHash: text("payload_hash").notNull(),
  correlationId: text("correlation_id").notNull(),
  causationId: text("causation_id").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const inventoryOpeningClaims = pgTable("inventory_opening_claims", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => inventoryAccounts.id),
  transactionId: uuid("transaction_id")
    .notNull()
    .unique()
    .references(() => inventoryTransactions.id),
});
