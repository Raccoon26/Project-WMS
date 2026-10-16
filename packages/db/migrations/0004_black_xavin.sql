CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
--> statement-breakpoint
CREATE INDEX "products_name_search" ON "products" USING gin ("name_ja" public.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "sku_mappings_code_search" ON "sku_mappings" USING gin ("external_code" public.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "skus_code_search" ON "skus" USING gin ("code" public.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "skus_barcode_search" ON "skus" USING gin ("barcode" public.gin_trgm_ops);
--> statement-breakpoint
CREATE FUNCTION catalog_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.provider<>OLD.provider OR NEW.account_ref<>OLD.account_ref THEN RAISE EXCEPTION 'integration account identity immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER integration_account_identity BEFORE UPDATE ON integration_accounts FOR EACH ROW EXECUTE FUNCTION catalog_account_identity();
