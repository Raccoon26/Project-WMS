CREATE TABLE "command_results" (
	"actor_id" uuid NOT NULL,
	"key" text NOT NULL,
	"operation" text NOT NULL,
	"payload_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "command_results_fields" CHECK (length("command_results"."key") BETWEEN 8 AND 128 AND length("command_results"."payload_hash")=64)
);
--> statement-breakpoint
CREATE TABLE "integration_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"provider" text NOT NULL,
	"account_ref" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "integration_accounts_fields" CHECK ("integration_accounts"."provider" IN ('amazon','rakuten') AND "integration_accounts"."account_ref" ~ '^[a-zA-Z0-9._-]{1,100}$' AND length("integration_accounts"."name") BETWEEN 1 AND 200 AND "integration_accounts"."status" IN ('active','inactive') AND "integration_accounts"."version">0)
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "locations_fields" CHECK ("locations"."code" ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$' AND length("locations"."name") BETWEEN 1 AND 200 AND "locations"."status" IN ('active','inactive') AND "locations"."version">0 AND ("locations"."parent_id" IS NULL OR "locations"."parent_id"<>"locations"."id"))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"name_ja" text NOT NULL,
	"name_ko" text,
	"name_en" text,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "products_names" CHECK (length("products"."name_ja") BETWEEN 1 AND 200 AND ("products"."name_ko" IS NULL OR length("products"."name_ko") BETWEEN 1 AND 200) AND ("products"."name_en" IS NULL OR length("products"."name_en") BETWEEN 1 AND 200) AND ("products"."description" IS NULL OR length("products"."description") <= 2000)),
	CONSTRAINT "products_state" CHECK ("products"."status" IN ('active','inactive','discontinued') AND "products"."version">0)
);
--> statement-breakpoint
CREATE TABLE "sku_mappings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"marketplace" text NOT NULL,
	"external_code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"trust" text DEFAULT 'unverified' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"evidence_source" text,
	"evidence_version" integer,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"replaces_id" uuid,
	CONSTRAINT "sku_mappings_fields" CHECK ("sku_mappings"."provider" IN ('amazon','rakuten') AND "sku_mappings"."marketplace"='JP' AND length("sku_mappings"."external_code") BETWEEN 1 AND 100 AND "sku_mappings"."external_code" ~ '^[!-~]+$' AND "sku_mappings"."status" IN ('active','inactive') AND "sku_mappings"."trust" IN ('unverified','local_reviewed') AND "sku_mappings"."version">0 AND (("sku_mappings"."status"='active' AND "sku_mappings"."valid_to" IS NULL) OR ("sku_mappings"."status"='inactive' AND "sku_mappings"."valid_to" IS NOT NULL)) AND ("sku_mappings"."valid_to" IS NULL OR "sku_mappings"."valid_to">="sku_mappings"."valid_from")),
	CONSTRAINT "sku_mappings_review" CHECK (("sku_mappings"."trust"='unverified' AND "sku_mappings"."reviewed_by" IS NULL AND "sku_mappings"."reviewed_at" IS NULL AND "sku_mappings"."evidence_source" IS NULL AND "sku_mappings"."evidence_version" IS NULL) OR ("sku_mappings"."trust"='local_reviewed' AND "sku_mappings"."reviewed_by" IS NOT NULL AND "sku_mappings"."reviewed_at" IS NOT NULL AND "sku_mappings"."evidence_source"='local_manual' AND "sku_mappings"."evidence_version"="sku_mappings"."version"))
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"barcode" text,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "skus_code_unique" UNIQUE("code"),
	CONSTRAINT "skus_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "skus_code" CHECK ("skus"."code" ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$'),
	CONSTRAINT "skus_barcode" CHECK ("skus"."barcode" IS NULL OR "skus"."barcode" ~ '^[0-9]{8,14}$'),
	CONSTRAINT "skus_state" CHECK ("skus"."status" IN ('active','inactive','discontinued') AND "skus"."version">0)
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"adapter_config_ref" text,
	CONSTRAINT "warehouses_code_unique" UNIQUE("code"),
	CONSTRAINT "warehouses_code" CHECK ("warehouses"."code" ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$'),
	CONSTRAINT "warehouses_fields" CHECK (length("warehouses"."name") BETWEEN 1 AND 200 AND ("warehouses"."adapter_config_ref" IS NULL OR "warehouses"."adapter_config_ref" ~ '^[a-zA-Z0-9._-]{1,100}$')),
	CONSTRAINT "warehouses_state" CHECK ("warehouses"."status" IN ('active','inactive') AND "warehouses"."version">0 AND "warehouses"."type" IN ('external_email','internal','fba','rsl'))
);
--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_scope_check";--> statement-breakpoint
DROP INDEX "user_roles_active";--> statement-breakpoint
ALTER TABLE "user_roles" ADD COLUMN "warehouse_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_accounts_provider" ON "integration_accounts" USING btree ("id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_identity" ON "locations" USING btree ("warehouse_id","id");--> statement-breakpoint
ALTER TABLE "command_results" ADD CONSTRAINT "command_results_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD CONSTRAINT "integration_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD CONSTRAINT "integration_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_locations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_warehouse" FOREIGN KEY ("warehouse_id","parent_id") REFERENCES "locations"("warehouse_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_mappings" ADD CONSTRAINT "sku_mappings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_mappings" ADD CONSTRAINT "sku_mappings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_mappings" ADD CONSTRAINT "sku_mappings_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_mappings" ADD CONSTRAINT "sku_mappings_account_id_integration_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "integration_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_mappings" ADD CONSTRAINT "sku_mappings_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_mappings" ADD CONSTRAINT "sku_mappings_replaces_id_sku_mappings_id_fk" FOREIGN KEY ("replaces_id") REFERENCES "sku_mappings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_mappings" ADD CONSTRAINT "sku_mappings_account_provider" FOREIGN KEY ("account_id","provider") REFERENCES "integration_accounts"("id","provider") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "command_results_actor_key" ON "command_results" USING btree ("actor_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_accounts_reference" ON "integration_accounts" USING btree ("provider","account_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_code" ON "locations" USING btree ("warehouse_id","code");--> statement-breakpoint
CREATE INDEX "products_name_page" ON "products" USING btree ("name_ja","id");--> statement-breakpoint
CREATE INDEX "products_status_page" ON "products" USING btree ("status","id");--> statement-breakpoint
CREATE UNIQUE INDEX "sku_mappings_active_external" ON "sku_mappings" USING btree ("account_id","provider","marketplace","external_code") WHERE "sku_mappings"."status"='active';--> statement-breakpoint
CREATE INDEX "sku_mappings_sku_page" ON "sku_mappings" USING btree ("sku_id","id");--> statement-breakpoint
CREATE INDEX "sku_mappings_code_page" ON "sku_mappings" USING btree ("external_code","id");--> statement-breakpoint
CREATE INDEX "skus_code_page" ON "skus" USING btree ("code","id");--> statement-breakpoint
CREATE INDEX "skus_product_page" ON "skus" USING btree ("product_id","id");--> statement-breakpoint
CREATE INDEX "skus_status_page" ON "skus" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "warehouses_code_page" ON "warehouses" USING btree ("code","id");--> statement-breakpoint
CREATE INDEX "warehouses_name_page" ON "warehouses" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "warehouses_type_page" ON "warehouses" USING btree ("type","id");--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_warehouse_active" ON "user_roles" USING btree ("user_id","role_id","warehouse_id") WHERE "user_roles"."revoked_at" IS NULL AND "user_roles"."scope"='warehouse';--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_active" ON "user_roles" USING btree ("user_id","role_id") WHERE "user_roles"."revoked_at" IS NULL AND "user_roles"."scope"='global';--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_scope_check" CHECK (("user_roles"."scope"='global' AND "user_roles"."warehouse_id" IS NULL) OR ("user_roles"."scope"='warehouse' AND "user_roles"."warehouse_id" IS NOT NULL));--> statement-breakpoint
CREATE FUNCTION catalog_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'catalog history is retained' USING ERRCODE='23514'; END $$;
--> statement-breakpoint
CREATE TRIGGER products_keep BEFORE DELETE ON products FOR EACH ROW EXECUTE FUNCTION catalog_no_delete();
CREATE TRIGGER skus_keep BEFORE DELETE ON skus FOR EACH ROW EXECUTE FUNCTION catalog_no_delete();
CREATE TRIGGER warehouses_keep BEFORE DELETE ON warehouses FOR EACH ROW EXECUTE FUNCTION catalog_no_delete();
CREATE TRIGGER locations_keep BEFORE DELETE ON locations FOR EACH ROW EXECUTE FUNCTION catalog_no_delete();
CREATE TRIGGER mappings_keep BEFORE DELETE ON sku_mappings FOR EACH ROW EXECUTE FUNCTION catalog_no_delete();
CREATE TRIGGER accounts_keep BEFORE DELETE ON integration_accounts FOR EACH ROW EXECUTE FUNCTION catalog_no_delete();
--> statement-breakpoint
CREATE FUNCTION catalog_location_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bad boolean; depth integer;
BEGIN
 PERFORM 1 FROM warehouses WHERE id=NEW.warehouse_id FOR UPDATE;
 IF TG_OP='UPDATE' AND NEW.warehouse_id<>OLD.warehouse_id THEN RAISE EXCEPTION 'immutable warehouse' USING ERRCODE='23514'; END IF;
 WITH RECURSIVE parents AS (
 SELECT id,parent_id,ARRAY[id] AS seen,1 AS n FROM locations WHERE id=NEW.parent_id AND warehouse_id=NEW.warehouse_id
 UNION ALL SELECT l.id,l.parent_id,p.seen||l.id,p.n+1 FROM locations l JOIN parents p ON l.id=p.parent_id WHERE NOT l.id=ANY(p.seen) AND p.n<=16
 ) SELECT COALESCE(bool_or(id=NEW.id),false),COALESCE(max(n),0) INTO bad,depth FROM parents;
 IF bad OR depth>=16 THEN RAISE EXCEPTION 'invalid location ancestry' USING ERRCODE='23514'; END IF;
 -- Include descendants: reparenting a subtree must not exceed the same depth budget.
 WITH RECURSIVE children AS (
 SELECT NEW.id AS id,1 AS n UNION ALL SELECT l.id,c.n+1 FROM locations l JOIN children c ON l.parent_id=c.id WHERE c.n<=16
 ) SELECT max(n)+depth>16 INTO bad FROM children;
 IF bad THEN RAISE EXCEPTION 'location depth exceeded' USING ERRCODE='23514'; END IF;
 IF NEW.status='active' AND NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locations WHERE id=NEW.parent_id AND status='active') THEN RAISE EXCEPTION 'inactive parent' USING ERRCODE='23514'; END IF;
 IF NEW.status='inactive' AND EXISTS(SELECT 1 FROM locations WHERE parent_id=NEW.id AND status='active') THEN RAISE EXCEPTION 'active children' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER locations_tree BEFORE INSERT OR UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION catalog_location_tree();
--> statement-breakpoint
CREATE FUNCTION catalog_stable_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='skus' AND (NEW.product_id<>OLD.product_id OR (NEW.code<>OLD.code AND EXISTS(SELECT 1 FROM sku_mappings WHERE sku_id=OLD.id))) THEN RAISE EXCEPTION 'referenced SKU identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER skus_identity BEFORE UPDATE ON skus FOR EACH ROW EXECUTE FUNCTION catalog_stable_identity();
--> statement-breakpoint
CREATE FUNCTION catalog_mapping_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.sku_id,NEW.account_id,NEW.provider,NEW.marketplace,NEW.external_code,NEW.valid_from,NEW.replaces_id) IS DISTINCT FROM ROW(OLD.sku_id,OLD.account_id,OLD.provider,OLD.marketplace,OLD.external_code,OLD.valid_from,OLD.replaces_id) OR OLD.status='inactive' THEN RAISE EXCEPTION 'mapping identity/history immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mappings_identity BEFORE UPDATE ON sku_mappings FOR EACH ROW EXECUTE FUNCTION catalog_mapping_identity();
--> statement-breakpoint
INSERT INTO permissions(code,description) VALUES
 ('warehouses.read','warehouse metadata read'),('warehouses.manage','warehouse metadata manage'),
 ('locations.read','location metadata read'),('locations.manage','location metadata manage'),
 ('mappings.read','local marketplace mappings read'),('mappings.manage','local marketplace mappings manage') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r CROSS JOIN permissions p WHERE
 (r.code='Administrator' AND p.code IN ('warehouses.read','warehouses.manage','locations.read','locations.manage','mappings.read','mappings.manage')) OR
 (r.code='Manager' AND p.code IN ('warehouses.read','warehouses.manage','locations.read','locations.manage','mappings.read','mappings.manage')) OR
 (r.code IN ('Operator','Viewer','Auditor') AND p.code IN ('warehouses.read','locations.read','mappings.read'))
 ON CONFLICT DO NOTHING;
INSERT INTO foundation_metadata(key,value) VALUES('catalog-policy-v1','DEV03: six permissions; Administrator/Manager manage, Operator/Viewer/Auditor read; existing grants preserved') ON CONFLICT DO NOTHING;
