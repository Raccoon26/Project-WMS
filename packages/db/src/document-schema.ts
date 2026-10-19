import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  boolean,
  jsonb,
  unique,
  foreignKey,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth-schema.js";
import {
  outbounds,
  outboundLines,
  reservations,
  shipmentLines,
} from "./inventory-schema.js";
import { skus } from "./catalog-schema.js";
const at = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const documentTemplates = pgTable("document_templates", {
  id: uuid("id").primaryKey(),
  code: text("code").notNull().unique(),
  kind: text("kind").notNull(),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: at(),
});
export const documentTemplateVersions = pgTable(
  "document_template_versions",
  {
    templateId: uuid("template_id")
      .notNull()
      .references(() => documentTemplates.id),
    version: integer("version").notNull(),
    definition: jsonb("definition").notNull(),
    canonical: text("canonical").notNull(),
    sha256: text("sha256").notNull(),
    sample: boolean("sample").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: at(),
  },
  (t) => [
    primaryKey({
      name: "document_template_version",
      columns: [t.templateId, t.version],
    }),
  ],
);
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey(),
    outboundId: uuid("outbound_id")
      .notNull()
      .references(() => outbounds.id),
    outboundVersion: bigint("outbound_version", { mode: "bigint" }).notNull(),
    contentVersion: bigint("content_version", { mode: "bigint" }).notNull(),
    templateId: uuid("template_id").notNull(),
    templateVersion: integer("template_version").notNull(),
    locale: text("locale").notNull(),
    sample: boolean("sample").notNull().default(true),
    snapshot: jsonb("snapshot").notNull(),
    canonical: text("canonical").notNull(),
    snapshotSha256: text("snapshot_sha256").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: at(),
    originXid: bigint("origin_xid", { mode: "bigint" })
      .notNull()
      .default(sql`txid_current()`),
  },
  (t) => [
    unique("document_content_version").on(t.outboundId, t.contentVersion),
    unique("document_actor_key").on(t.createdBy, t.idempotencyKey),
    unique("document_outbound_identity").on(t.id, t.outboundId),
    foreignKey({
      columns: [t.templateId, t.templateVersion],
      foreignColumns: [
        documentTemplateVersions.templateId,
        documentTemplateVersions.version,
      ],
    }),
  ],
);
export const documentLines = pgTable(
  "document_lines",
  {
    id: uuid("id").primaryKey(),
    documentId: uuid("document_id").notNull(),
    outboundId: uuid("outbound_id").notNull(),
    outboundLineId: uuid("outbound_line_id")
      .notNull()
      .references(() => outboundLines.id),
    skuId: uuid("sku_id")
      .notNull()
      .references(() => skus.id),
    snapshot: jsonb("snapshot").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.documentId, t.outboundId],
      foreignColumns: [documents.id, documents.outboundId],
    }),
    unique("document_line_identity").on(t.documentId, t.outboundLineId),
  ],
);
export const documentSources = pgTable(
  "document_sources",
  {
    id: uuid("id").primaryKey(),
    documentId: uuid("document_id").notNull(),
    outboundLineId: uuid("outbound_line_id").notNull(),
    reservationId: uuid("reservation_id").references(() => reservations.id),
    shipmentLineId: uuid("shipment_line_id").references(() => shipmentLines.id),
    snapshot: jsonb("snapshot").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.documentId, t.outboundLineId],
      foreignColumns: [documentLines.documentId, documentLines.outboundLineId],
    }),
  ],
);
export const documentArtifacts = pgTable(
  "document_artifacts",
  {
    id: uuid("id").primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    format: text("format").notNull(),
    state: text("state").notNull().default("pending"),
    storageKey: text("storage_key").notNull().unique(),
    sha256: text("sha256"),
    byteSize: bigint("byte_size", { mode: "bigint" }),
    rendererVersion: text("renderer_version"),
    revision: bigint("revision", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdAt: at(),
  },
  (t) => [
    unique("document_artifact_format").on(t.documentId, t.format),
    unique("document_artifact_identity").on(t.id, t.documentId),
  ],
);
export const documentEvents = pgTable(
  "document_events",
  {
    id: uuid("id").primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    artifactId: uuid("artifact_id"),
    artifactRevision: bigint("artifact_revision", { mode: "bigint" }),
    state: text("state"),
    sequence: bigint("sequence", { mode: "bigint" }).notNull(),
    event: text("event").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    requestId: text("request_id").notNull(),
    createdAt: at(),
  },
  (t) => [
    unique("document_event_sequence").on(t.documentId, t.sequence),
    foreignKey({
      columns: [t.artifactId, t.documentId],
      foreignColumns: [documentArtifacts.id, documentArtifacts.documentId],
    }),
  ],
);
