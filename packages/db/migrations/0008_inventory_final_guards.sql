-- Backfill durable first-opening claims before enforcing subsequent new events.
INSERT INTO inventory_opening_claims(account_id,transaction_id)
SELECT e.account_id,e.transaction_id FROM inventory_entries e JOIN inventory_transactions t ON t.id=e.transaction_id
WHERE t.movement_type='opening' AND e.quantity>0
ON CONFLICT(account_id) DO NOTHING;
ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_reverse_reference CHECK((movement_type='reverse')=(reverses_id IS NOT NULL));
ALTER TABLE reservations ADD CONSTRAINT inventory_reservation_status CHECK((status='active' AND consumed::numeric+released<quantity) OR(status='consumed' AND consumed::numeric+released=quantity AND consumed>0) OR(status='released' AND consumed::numeric+released=quantity AND released>0));
CREATE FUNCTION inventory_reversal_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original uuid; tid uuid;
BEGIN
 IF TG_TABLE_NAME='inventory_transactions' THEN tid=NEW.id; ELSE tid=NEW.transaction_id; END IF;
 SELECT reverses_id INTO original FROM inventory_transactions WHERE id=tid;
 IF original IS NULL THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM inventory_transactions WHERE id=original AND reverses_id IS NOT NULL) OR EXISTS(
  SELECT sku_id,account_id FROM inventory_entries WHERE transaction_id IN(tid,original)
  GROUP BY sku_id,account_id HAVING sum(quantity)<>0
 ) THEN RAISE EXCEPTION 'REVERSAL_DOES_NOT_MATCH_ORIGINAL' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inventory_reverse_transaction AFTER INSERT ON inventory_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_reversal_commit();
CREATE CONSTRAINT TRIGGER inventory_reverse_entry AFTER INSERT ON inventory_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_reversal_commit();
