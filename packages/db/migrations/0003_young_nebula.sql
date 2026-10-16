CREATE TABLE "catalog_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"actor_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_revisions_entity" CHECK ("catalog_revisions"."entity" IN ('products','skus','warehouses','locations','integration_accounts','sku_mappings') AND "catalog_revisions"."version">0)
);
--> statement-breakpoint
ALTER TABLE "sku_mappings" DROP CONSTRAINT "sku_mappings_review";--> statement-breakpoint
ALTER TABLE "catalog_revisions" ADD CONSTRAINT "catalog_revisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_revisions_version" ON "catalog_revisions" USING btree ("entity","entity_id","version");--> statement-breakpoint
ALTER TABLE "sku_mappings" ADD CONSTRAINT "sku_mappings_review" CHECK (("sku_mappings"."trust"='unverified' AND "sku_mappings"."reviewed_by" IS NULL AND "sku_mappings"."reviewed_at" IS NULL AND "sku_mappings"."evidence_source" IS NULL AND "sku_mappings"."evidence_version" IS NULL) OR ("sku_mappings"."trust"='local_reviewed' AND "sku_mappings"."reviewed_by" IS NOT NULL AND "sku_mappings"."reviewed_at" IS NOT NULL AND "sku_mappings"."evidence_source"='local_manual' AND "sku_mappings"."evidence_version"<="sku_mappings"."version" AND "sku_mappings"."evidence_version">0));
--> statement-breakpoint
CREATE TRIGGER catalog_revisions_keep BEFORE UPDATE OR DELETE ON catalog_revisions FOR EACH ROW EXECUTE FUNCTION catalog_no_delete();
