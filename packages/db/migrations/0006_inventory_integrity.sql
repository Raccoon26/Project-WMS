CREATE FUNCTION inventory_business_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oid uuid; l record; n numeric; rec record;
BEGIN
 IF TG_TABLE_NAME='outbound_lines' THEN oid=NEW.outbound_id;
 ELSIF TG_TABLE_NAME='reservations' THEN SELECT outbound_id INTO oid FROM outbound_lines WHERE id=NEW.outbound_line_id;
 ELSIF TG_TABLE_NAME='shipment_lines' THEN SELECT outbound_id INTO oid FROM shipments WHERE id=NEW.shipment_id;
 ELSIF TG_TABLE_NAME='receipt_lines' THEN SELECT s.outbound_id INTO oid FROM shipment_lines sl JOIN shipments s ON s.id=sl.shipment_id WHERE sl.id=NEW.shipment_line_id;
 ELSE oid=NEW.outbound_id; END IF;
 FOR l IN SELECT * FROM outbound_lines WHERE outbound_id=oid LOOP
  IF l.shipped_qty<>(SELECT coalesce(sum(shipped_qty),0) FROM shipment_lines WHERE outbound_line_id=l.id) THEN RAISE EXCEPTION 'SHIPMENT_PROJECTION_MISMATCH' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM shipment_lines sl JOIN shipments sh ON sh.id=sl.shipment_id WHERE sl.outbound_line_id=l.id AND (sl.sku_id<>l.sku_id OR sh.outbound_id<>oid)) THEN RAISE EXCEPTION 'SHIPMENT_LINE_MISMATCH' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(quantity),0) INTO n FROM reservations WHERE outbound_line_id=l.id;
  IF n>l.requested_qty THEN RAISE EXCEPTION 'RESERVATION_REQUEST_EXCEEDED' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(consumed),0) INTO n FROM reservations WHERE outbound_line_id=l.id;
  IF n<>l.shipped_qty THEN RAISE EXCEPTION 'RESERVATION_SHIPMENT_MISMATCH' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR l IN SELECT sl.* FROM shipment_lines sl JOIN shipments sh ON sh.id=sl.shipment_id WHERE sh.outbound_id=oid LOOP
  IF l.received_qty<>(SELECT coalesce(sum(rl.quantity),0) FROM receipt_lines rl JOIN receipts r ON r.id=rl.receipt_id WHERE rl.shipment_line_id=l.id AND r.status='accepted') THEN RAISE EXCEPTION 'RECEIPT_PROJECTION_MISMATCH' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM receipt_lines rl JOIN receipts r ON r.id=rl.receipt_id JOIN inbounds i ON i.id=r.inbound_id WHERE rl.shipment_line_id=l.id AND i.outbound_id<>oid) THEN RAISE EXCEPTION 'RECEIPT_SHIPMENT_MISMATCH' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR rec IN SELECT il.*,i.destination_warehouse_id,i.outbound_id AS ioid FROM inbound_lines il JOIN inbounds i ON i.id=il.inbound_id WHERE i.outbound_id=oid LOOP
  IF rec.ioid<>oid OR rec.sku_id<>(SELECT sku_id FROM outbound_lines WHERE id=rec.outbound_line_id) OR rec.received_qty<>(SELECT coalesce(sum(received_qty),0) FROM shipment_lines WHERE outbound_line_id=rec.outbound_line_id) OR rec.expected_qty<>(SELECT requested_qty FROM outbound_lines WHERE id=rec.outbound_line_id) OR rec.destination_warehouse_id<>(SELECT destination_warehouse_id FROM outbounds WHERE id=oid) THEN RAISE EXCEPTION 'INBOUND_RELATION_MISMATCH' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inventory_line_commit AFTER INSERT OR UPDATE ON outbound_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_business_commit();
CREATE CONSTRAINT TRIGGER inventory_reservation_commit AFTER INSERT OR UPDATE ON reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_business_commit();
CREATE CONSTRAINT TRIGGER inventory_shipment_commit AFTER INSERT OR UPDATE ON shipment_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_business_commit();
CREATE CONSTRAINT TRIGGER inventory_receipt_commit AFTER INSERT OR UPDATE ON receipt_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_business_commit();
CREATE CONSTRAINT TRIGGER inventory_inbound_commit AFTER INSERT OR UPDATE ON inbounds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_business_commit();
CREATE TRIGGER inventory_shipment_no_delete BEFORE DELETE ON shipments FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_shipment_line_no_delete BEFORE DELETE ON shipment_lines FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_receipt_immutable BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_receipt_line_immutable BEFORE UPDATE OR DELETE ON receipt_lines FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_command_evidence_immutable BEFORE UPDATE OR DELETE ON command_results FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_reconciliation_item_immutable BEFORE UPDATE OR DELETE ON reconciliation_items FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
