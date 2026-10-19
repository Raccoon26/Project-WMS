ALTER TABLE inbounds ADD CONSTRAINT inventory_inbound_state CHECK(version>0 AND state IN('planned','partially_received','received','held','cancelled'));
CREATE TRIGGER inventory_outbound_no_delete BEFORE DELETE ON outbounds FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_outbound_line_no_delete BEFORE DELETE ON outbound_lines FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_inbound_no_delete BEFORE DELETE ON inbounds FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_inbound_line_no_delete BEFORE DELETE ON inbound_lines FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_transfer_immutable BEFORE UPDATE OR DELETE ON transfers FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE TRIGGER inventory_shipment_reference_immutable BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
