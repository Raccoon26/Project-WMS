import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
export const foundationMetadata = pgTable("foundation_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export * from "./auth-schema.js";

export * from "./catalog-schema.js";

export * from "./inventory-schema.js";

export * from "./document-schema.js";
