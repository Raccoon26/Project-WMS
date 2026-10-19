CREATE TABLE "inventory_opening_claims" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	CONSTRAINT "inventory_opening_claims_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
ALTER TABLE "inventory_opening_claims" ADD CONSTRAINT "inventory_opening_claims_account_id_inventory_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "inventory_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_opening_claims" ADD CONSTRAINT "inventory_opening_claims_transaction_id_inventory_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "inventory_transactions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION inventory_balance_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b inventory_balances; a inventory_accounts; ledger numeric; reserved_sum numeric;
BEGIN
 SELECT * INTO STRICT b FROM inventory_balances WHERE account_id=NEW.account_id;
 -- Deferred events retain NEW.version; only the last projection revision needs
 -- the expensive ledger SUM. No client-controlled cache or bypass variable.
 IF NEW.version<>b.version THEN RETURN NULL; END IF;
 SELECT * INTO STRICT a FROM inventory_accounts WHERE id=b.account_id;
 SELECT coalesce(sum(quantity),0) INTO ledger FROM inventory_entries WHERE account_id=b.account_id;
 SELECT coalesce(sum(quantity::numeric-consumed-released),0) INTO reserved_sum FROM reservations WHERE account_id=b.account_id;
 IF b.quantity<>ledger OR b.reserved<>reserved_sum OR (a.kind<>'external_boundary' AND b.quantity<0) OR (a.kind='good' AND b.quantity<b.reserved) OR (a.kind<>'good' AND b.reserved<>0) THEN RAISE EXCEPTION 'INVENTORY_PROJECTION_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

CREATE TRIGGER inventory_opening_claim_immutable BEFORE UPDATE OR DELETE ON inventory_opening_claims FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE FUNCTION inventory_opening_claim() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; target uuid; existing uuid;
BEGIN
 IF TG_TABLE_NAME='inventory_transactions' THEN tid=NEW.id; ELSE tid=NEW.transaction_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM inventory_transactions WHERE id=tid AND movement_type='opening') THEN RETURN NULL; END IF;
 SELECT account_id INTO target FROM inventory_entries WHERE transaction_id=tid AND quantity>0;
 IF target IS NULL OR (SELECT count(*) FROM inventory_entries WHERE transaction_id=tid AND quantity>0)<>1 THEN RAISE EXCEPTION 'INVALID_OPENING' USING ERRCODE='23514'; END IF;
 INSERT INTO inventory_opening_claims(account_id,transaction_id) VALUES(target,tid) ON CONFLICT DO NOTHING;
 SELECT transaction_id INTO existing FROM inventory_opening_claims WHERE account_id=target;
 IF existing IS DISTINCT FROM tid THEN RAISE EXCEPTION 'DUPLICATE_OPENING' USING ERRCODE='23505'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inventory_opening_transaction AFTER INSERT ON inventory_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_opening_claim();
CREATE CONSTRAINT TRIGGER inventory_opening_entry AFTER INSERT ON inventory_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_opening_claim();
CREATE FUNCTION inventory_transit_route() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source uuid;
BEGIN
 IF NEW.kind='transit' THEN
  SELECT o.source_warehouse_id INTO STRICT source FROM shipments s JOIN outbounds o ON o.id=s.outbound_id WHERE s.id=NEW.shipment_id;
  IF source<>NEW.warehouse_id THEN RAISE EXCEPTION 'TRANSIT_WAREHOUSE_MISMATCH' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_account_route BEFORE INSERT ON inventory_accounts FOR EACH ROW EXECUTE FUNCTION inventory_transit_route();
