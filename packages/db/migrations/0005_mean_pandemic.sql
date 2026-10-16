CREATE TABLE "inbound_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inbound_id" uuid NOT NULL,
	"outbound_line_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"expected_qty" bigint NOT NULL,
	"received_qty" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "inbound_lines_outbound_line_id_unique" UNIQUE("outbound_line_id")
);
--> statement-breakpoint
CREATE TABLE "inbounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"outbound_id" uuid NOT NULL,
	"destination_warehouse_id" uuid NOT NULL,
	"state" text DEFAULT 'planned' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbounds_outbound_id_unique" UNIQUE("outbound_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sku_id" uuid NOT NULL,
	"warehouse_id" uuid,
	"location_id" uuid,
	"shipment_id" uuid,
	"kind" text NOT NULL,
	"owner" text DEFAULT 'business' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"quantity" bigint DEFAULT 0 NOT NULL,
	"reserved" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"quantity" bigint NOT NULL,
	"line_no" integer NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text NOT NULL,
	"operation" text NOT NULL,
	"scope" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"quantity" bigint NOT NULL,
	"reference" text NOT NULL,
	"trust" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"movement_type" text NOT NULL,
	"reason" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"actor_id" uuid,
	"service_actor_id" uuid,
	"source_system" text NOT NULL,
	"source_event_id" text NOT NULL,
	"scope" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"evidence_id" uuid NOT NULL,
	"reverses_id" uuid,
	"related_transaction_id" uuid,
	"request_id" text NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"origin_xid" bigint DEFAULT txid_current() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"outbound_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"requested_qty" bigint NOT NULL,
	"shipped_qty" bigint DEFAULT 0 NOT NULL,
	"cancelled_qty" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_ref" text NOT NULL,
	"source_warehouse_id" uuid NOT NULL,
	"destination_warehouse_id" uuid NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbounds_business_ref_unique" UNIQUE("business_ref")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"action_key" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"aggregate_version" bigint NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"correlation_id" text NOT NULL,
	"causation_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_action_key_unique" UNIQUE("action_key")
);
--> statement-breakpoint
CREATE TABLE "receipt_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receipt_id" uuid NOT NULL,
	"shipment_line_id" uuid NOT NULL,
	"quantity" bigint NOT NULL,
	"condition" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inbound_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_evidence_id_unique" UNIQUE("evidence_id")
);
--> statement-breakpoint
CREATE TABLE "reconciliation_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"expected" bigint NOT NULL,
	"observed" bigint NOT NULL,
	"difference" bigint NOT NULL,
	"evidence_ref" text NOT NULL,
	"resolution_transaction_id" uuid
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"outbound_line_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"quantity" bigint NOT NULL,
	"consumed" bigint DEFAULT 0 NOT NULL,
	"released" bigint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_actors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "service_actors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "shipment_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shipment_id" uuid NOT NULL,
	"outbound_line_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"shipped_qty" bigint NOT NULL,
	"received_qty" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"outbound_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_evidence_id_unique" UNIQUE("evidence_id")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"outbound_id" uuid NOT NULL,
	"inbound_id" uuid NOT NULL,
	CONSTRAINT "transfers_outbound_id_unique" UNIQUE("outbound_id"),
	CONSTRAINT "transfers_inbound_id_unique" UNIQUE("inbound_id")
);
--> statement-breakpoint
ALTER TABLE "inbound_lines" ADD CONSTRAINT "inbound_lines_inbound_id_inbounds_id_fk" FOREIGN KEY ("inbound_id") REFERENCES "inbounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_lines" ADD CONSTRAINT "inbound_lines_outbound_line_id_outbound_lines_id_fk" FOREIGN KEY ("outbound_line_id") REFERENCES "outbound_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_lines" ADD CONSTRAINT "inbound_lines_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbounds" ADD CONSTRAINT "inbounds_outbound_id_outbounds_id_fk" FOREIGN KEY ("outbound_id") REFERENCES "outbounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbounds" ADD CONSTRAINT "inbounds_destination_warehouse_id_warehouses_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_accounts" ADD CONSTRAINT "inventory_accounts_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_accounts" ADD CONSTRAINT "inventory_accounts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_accounts" ADD CONSTRAINT "inventory_accounts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_accounts" ADD CONSTRAINT "inventory_accounts_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_account_id_inventory_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "inventory_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_transaction_id_inventory_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_account_id_inventory_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "inventory_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_evidence" ADD CONSTRAINT "inventory_evidence_scope_warehouses_id_fk" FOREIGN KEY ("scope") REFERENCES "warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_evidence" ADD CONSTRAINT "inventory_evidence_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_evidence" ADD CONSTRAINT "inventory_evidence_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_service_actor_id_service_actors_id_fk" FOREIGN KEY ("service_actor_id") REFERENCES "service_actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_scope_warehouses_id_fk" FOREIGN KEY ("scope") REFERENCES "warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_evidence_id_inventory_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "inventory_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_reverses_id_inventory_transactions_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_related_transaction_id_inventory_transactions_id_fk" FOREIGN KEY ("related_transaction_id") REFERENCES "inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_lines" ADD CONSTRAINT "outbound_lines_outbound_id_outbounds_id_fk" FOREIGN KEY ("outbound_id") REFERENCES "outbounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_lines" ADD CONSTRAINT "outbound_lines_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbounds" ADD CONSTRAINT "outbounds_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbounds" ADD CONSTRAINT "outbounds_destination_warehouse_id_warehouses_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbounds" ADD CONSTRAINT "outbounds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_shipment_line_id_shipment_lines_id_fk" FOREIGN KEY ("shipment_line_id") REFERENCES "shipment_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_inbound_id_inbounds_id_fk" FOREIGN KEY ("inbound_id") REFERENCES "inbounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_evidence_id_inventory_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "inventory_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "reconciliation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_account_id_inventory_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "inventory_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_resolution_transaction_id_inventory_transactions_id_fk" FOREIGN KEY ("resolution_transaction_id") REFERENCES "inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_outbound_line_id_outbound_lines_id_fk" FOREIGN KEY ("outbound_line_id") REFERENCES "outbound_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_account_id_inventory_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "inventory_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_outbound_line_id_outbound_lines_id_fk" FOREIGN KEY ("outbound_line_id") REFERENCES "outbound_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_outbound_id_outbounds_id_fk" FOREIGN KEY ("outbound_id") REFERENCES "outbounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_evidence_id_inventory_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "inventory_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_outbound_id_outbounds_id_fk" FOREIGN KEY ("outbound_id") REFERENCES "outbounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_inbound_id_inbounds_id_fk" FOREIGN KEY ("inbound_id") REFERENCES "inbounds"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE inventory_accounts ADD CONSTRAINT inventory_account_identity UNIQUE NULLS NOT DISTINCT(sku_id,warehouse_id,location_id,kind,shipment_id);
ALTER TABLE inventory_accounts ADD CONSTRAINT inventory_account_sku UNIQUE(id,sku_id);
ALTER TABLE inventory_accounts ADD CONSTRAINT inventory_location_warehouse FOREIGN KEY(warehouse_id,location_id) REFERENCES locations(warehouse_id,id);
ALTER TABLE inventory_accounts ADD CONSTRAINT inventory_account_kind CHECK(owner='business' AND ((kind IN ('good','damaged','quarantine') AND warehouse_id IS NOT NULL AND shipment_id IS NULL) OR (kind='transit' AND shipment_id IS NOT NULL AND warehouse_id IS NOT NULL AND location_id IS NULL) OR (kind='external_boundary' AND warehouse_id IS NULL AND location_id IS NULL AND shipment_id IS NULL)));
ALTER TABLE inventory_entries ADD CONSTRAINT inventory_entry_sku FOREIGN KEY(account_id,sku_id) REFERENCES inventory_accounts(id,sku_id);
ALTER TABLE inventory_entries ADD CONSTRAINT inventory_entry_line UNIQUE(transaction_id,line_no), ADD CONSTRAINT inventory_entry_quantity CHECK(quantity<>0 AND line_no>0);
ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_source_event UNIQUE(source_system,scope,movement_type,source_event_id), ADD CONSTRAINT inventory_reversal UNIQUE(reverses_id), ADD CONSTRAINT inventory_transaction_fields CHECK(length(reason) BETWEEN 1 AND 1000 AND length(payload_hash)=64 AND length(idempotency_key) BETWEEN 8 AND 128 AND ((actor_id IS NULL)<>(service_actor_id IS NULL)));
ALTER TABLE inventory_evidence ADD CONSTRAINT inventory_evidence_event UNIQUE(source,scope,operation,source_event_id), ADD CONSTRAINT inventory_evidence_reference UNIQUE(source,scope,operation,reference), ADD CONSTRAINT inventory_evidence_fields CHECK(quantity>0 AND trust IN ('synthetic_test','local_manual','external_unverified','validated','rejected','quarantined') AND length(payload_hash)=64);
ALTER TABLE inventory_balances ADD CONSTRAINT inventory_balance_fields CHECK(reserved>=0 AND version>0);
ALTER TABLE outbound_lines ADD CONSTRAINT outbound_line_sku UNIQUE(outbound_id,sku_id), ADD CONSTRAINT outbound_line_qty CHECK(requested_qty>0 AND shipped_qty>=0 AND cancelled_qty>=0 AND shipped_qty::numeric+cancelled_qty<=requested_qty);
ALTER TABLE outbounds ADD CONSTRAINT outbound_route CHECK(source_warehouse_id<>destination_warehouse_id AND version>0 AND policy_version=1 AND state IN ('draft','reserved','awaiting_approval','approved','document_ready','instruction_pending','sent','acknowledged','picking','partially_shipped','shipped','in_transit','partially_received','received','reconciled','held','cancelled','cancellation_requested','unknown'));
ALTER TABLE shipment_lines ADD CONSTRAINT shipment_line_unique UNIQUE(shipment_id,outbound_line_id), ADD CONSTRAINT shipment_line_qty CHECK(shipped_qty>0 AND received_qty>=0 AND received_qty<=shipped_qty);
ALTER TABLE inbound_lines ADD CONSTRAINT inbound_line_qty CHECK(expected_qty>0 AND received_qty>=0 AND received_qty<=expected_qty);
ALTER TABLE reservations ADD CONSTRAINT reservation_identity UNIQUE(outbound_line_id,account_id), ADD CONSTRAINT reservation_quantities CHECK(quantity>0 AND consumed>=0 AND released>=0 AND consumed::numeric+released<=quantity AND version>0 AND status IN ('active','consumed','released'));
ALTER TABLE receipt_lines ADD CONSTRAINT receipt_line_qty CHECK(quantity>0 AND condition IN ('good','damaged','quarantine'));
ALTER TABLE receipts ADD CONSTRAINT receipt_status CHECK(status IN ('accepted','held'));
ALTER TABLE reconciliation_items ADD CONSTRAINT reconciliation_difference CHECK(observed>=0 AND difference::numeric=observed::numeric-expected);
ALTER TABLE reconciliation_runs ADD CONSTRAINT reconciliation_state CHECK(status IN ('held','matched','resolved'));
ALTER TABLE outbox ADD CONSTRAINT inventory_outbox_state CHECK(status IN ('pending','held','consumed') AND aggregate_version>0 AND length(payload_hash)=64);
CREATE INDEX inventory_entries_sku_page ON inventory_entries(sku_id,recorded_at,id);
CREATE INDEX inventory_entries_account_page ON inventory_entries(account_id,recorded_at,id);
CREATE INDEX inventory_transactions_page ON inventory_transactions(recorded_at,id);
CREATE INDEX inventory_outbound_page ON outbounds(state,created_at,id);
CREATE INDEX inventory_reservations_account ON reservations(account_id) WHERE status='active';
CREATE INDEX inventory_outbox_pending ON outbox(created_at,id) WHERE status='pending';
CREATE INDEX inventory_account_warehouse ON inventory_accounts(warehouse_id,sku_id,kind,id);

CREATE FUNCTION inventory_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_INVENTORY' USING ERRCODE='23514'; END $$;
CREATE TRIGGER inventory_entries_immutable BEFORE UPDATE OR DELETE ON inventory_entries FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_transactions_immutable BEFORE UPDATE OR DELETE ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_accounts_immutable BEFORE UPDATE OR DELETE ON inventory_accounts FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_evidence_immutable BEFORE UPDATE OR DELETE ON inventory_evidence FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_balance_no_delete BEFORE DELETE ON inventory_balances FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_reservation_no_delete BEFORE DELETE ON reservations FOR EACH ROW EXECUTE FUNCTION inventory_immutable();

CREATE FUNCTION inventory_account_created() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO inventory_balances(account_id) VALUES(NEW.id); RETURN NEW;
END $$;
CREATE TRIGGER inventory_account_projection AFTER INSERT ON inventory_accounts FOR EACH ROW EXECUTE FUNCTION inventory_account_created();

CREATE FUNCTION inventory_entry_post() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t inventory_transactions;
BEGIN
 SELECT * INTO STRICT t FROM inventory_transactions WHERE id=NEW.transaction_id;
 IF t.origin_xid<>txid_current() OR t.recorded_at<>NEW.recorded_at THEN RAISE EXCEPTION 'POSTING_CLOSED_OR_TIME' USING ERRCODE='23514'; END IF;
 UPDATE inventory_balances SET quantity=quantity+NEW.quantity,version=version+1,updated_at=now() WHERE account_id=NEW.account_id;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_entry_projection AFTER INSERT ON inventory_entries FOR EACH ROW EXECUTE FUNCTION inventory_entry_post();

CREATE FUNCTION inventory_balanced_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid;
BEGIN
 IF TG_TABLE_NAME='inventory_transactions' THEN tid=NEW.id; ELSE tid=NEW.transaction_id; END IF;
 IF (SELECT count(*) FROM inventory_entries WHERE transaction_id=tid)<2 OR EXISTS(SELECT sku_id FROM inventory_entries WHERE transaction_id=tid GROUP BY sku_id HAVING sum(quantity)<>0) THEN RAISE EXCEPTION 'UNBALANCED_INVENTORY' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inventory_transaction_commit AFTER INSERT ON inventory_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_balanced_commit();
CREATE CONSTRAINT TRIGGER inventory_entry_commit AFTER INSERT ON inventory_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_balanced_commit();

CREATE FUNCTION inventory_balance_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b inventory_balances; a inventory_accounts; ledger numeric; reserved_sum numeric;
BEGIN
 SELECT * INTO STRICT b FROM inventory_balances WHERE account_id=NEW.account_id;
 SELECT * INTO STRICT a FROM inventory_accounts WHERE id=b.account_id;
 SELECT coalesce(sum(quantity),0) INTO ledger FROM inventory_entries WHERE account_id=b.account_id;
 SELECT coalesce(sum(quantity::numeric-consumed-released),0) INTO reserved_sum FROM reservations WHERE account_id=b.account_id;
 IF b.quantity<>ledger OR b.reserved<>reserved_sum OR (a.kind<>'external_boundary' AND b.quantity<0) OR (a.kind='good' AND b.quantity<b.reserved) OR (a.kind<>'good' AND b.reserved<>0) THEN RAISE EXCEPTION 'INVENTORY_PROJECTION_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inventory_balance_check AFTER INSERT OR UPDATE ON inventory_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_balance_commit();

CREATE FUNCTION inventory_reservation_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta bigint; a inventory_accounts; l outbound_lines; w uuid;
BEGIN
 SELECT * INTO STRICT a FROM inventory_accounts WHERE id=NEW.account_id;
 SELECT * INTO STRICT l FROM outbound_lines WHERE id=NEW.outbound_line_id;
 SELECT source_warehouse_id INTO STRICT w FROM outbounds WHERE id=l.outbound_id;
 IF a.kind<>'good' OR a.sku_id<>l.sku_id OR a.warehouse_id<>w THEN RAISE EXCEPTION 'INVALID_RESERVATION_ACCOUNT' USING ERRCODE='23514'; END IF;
 delta=NEW.quantity-NEW.consumed-NEW.released;
 IF TG_OP='UPDATE' THEN
  IF NEW.account_id<>OLD.account_id OR NEW.outbound_line_id<>OLD.outbound_line_id OR NEW.quantity<>OLD.quantity OR NEW.consumed<OLD.consumed OR NEW.released<OLD.released THEN RAISE EXCEPTION 'INVALID_RESERVATION_CHANGE' USING ERRCODE='23514'; END IF;
  delta=delta-(OLD.quantity-OLD.consumed-OLD.released);
 END IF;
 UPDATE inventory_balances SET reserved=reserved+delta,version=version+1,updated_at=now() WHERE account_id=NEW.account_id;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_reservation_update AFTER INSERT OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION inventory_reservation_projection();

CREATE FUNCTION inventory_sku_frozen() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.code<>OLD.code AND EXISTS(SELECT 1 FROM inventory_entries WHERE sku_id=OLD.id) THEN RAISE EXCEPTION 'SKU_HAS_LEDGER_HISTORY' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER inventory_sku_code_guard BEFORE UPDATE ON skus FOR EACH ROW EXECUTE FUNCTION inventory_sku_frozen();
