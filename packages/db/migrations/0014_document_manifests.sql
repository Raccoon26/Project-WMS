-- Additive Manifest/quantity extension; immutable schemaVersion=1 historical documents remain intact.
CREATE FUNCTION document_manifest_valid(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_typeof(v)='object' AND v ?& ARRAY['schemaVersion','format','kind','defaultLocale','locales','layout','style','fields']
 AND v-ARRAY['schemaVersion','format','kind','defaultLocale','locales','layout','style','fields']='{}'::jsonb
 AND (v->'schemaVersion')='1'::jsonb AND v->>'format' IN ('xlsx','pdf') AND v->>'kind' IN ('instruction','manifest') AND v->>'defaultLocale'='ja'
 AND jsonb_array_length((v->'locales'))=3 AND (v->'locales') @> '["ja","ko","en"]'::jsonb
 AND ((v->'layout'))-ARRAY['paper','orientation','marginMm']='{}'::jsonb AND v#>>'{layout,paper}'='A4'
 AND v#>>'{layout,orientation}' IN ('portrait','landscape') AND v#>'{layout,marginMm}' IN ('12'::jsonb,'16'::jsonb,'20'::jsonb)
 AND ((v->'style'))-ARRAY['font','sizePt','accent']='{}'::jsonb AND v#>>'{style,font}'='noto-cjk'
 AND v#>'{style,sizePt}' IN ('10'::jsonb,'11'::jsonb,'12'::jsonb) AND v#>>'{style,accent}' IN ('slate','navy')
 AND jsonb_array_length((v->'fields'))=13 AND (v->'fields') @> '[{"field": "outbound", "source": "outbound.businessRef"}, {"field": "sourceWarehouse", "source": "outbound.source.name"}, {"field": "destinationWarehouse", "source": "outbound.destination.name"}, {"field": "sku", "source": "lines.skuCode"}, {"field": "product", "source": "lines.productName"}, {"field": "requested", "source": "lines.requested"}, {"field": "cancelled", "source": "lines.cancelled"}, {"field": "reservedRemaining", "source": "lines.reserved"}, {"field": "alreadyShipped", "source": "lines.shipped"}, {"field": "unshipped", "source": "lines.remaining"}, {"field": "received", "source": "lines.received"}, {"field": "transit", "source": "lines.transit"}, {"field": "thisDocumentQuantity", "source": "documentQuantities.lines.quantity"}]'::jsonb AND '[{"field": "outbound", "source": "outbound.businessRef"}, {"field": "sourceWarehouse", "source": "outbound.source.name"}, {"field": "destinationWarehouse", "source": "outbound.destination.name"}, {"field": "sku", "source": "lines.skuCode"}, {"field": "product", "source": "lines.productName"}, {"field": "requested", "source": "lines.requested"}, {"field": "cancelled", "source": "lines.cancelled"}, {"field": "reservedRemaining", "source": "lines.reserved"}, {"field": "alreadyShipped", "source": "lines.shipped"}, {"field": "unshipped", "source": "lines.remaining"}, {"field": "received", "source": "lines.received"}, {"field": "transit", "source": "lines.transit"}, {"field": "thisDocumentQuantity", "source": "documentQuantities.lines.quantity"}]'::jsonb @> (v->'fields'),false)
$$;
--> statement-breakpoint
ALTER TABLE document_template_versions ADD CONSTRAINT document_manifest_schema CHECK(NOT(definition ? 'manifest') OR document_manifest_valid(definition->'manifest'));
CREATE FUNCTION document_manifest_kind() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.definition ? 'manifest' AND NEW.definition#>>'{manifest,kind}' IS DISTINCT FROM (SELECT kind FROM document_templates WHERE id=NEW.template_id) THEN RAISE EXCEPTION 'INVALID_TEMPLATE_KIND' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER document_manifest_kind_guard BEFORE INSERT ON document_template_versions FOR EACH ROW EXECUTE FUNCTION document_manifest_kind();
--> statement-breakpoint
CREATE FUNCTION document_quantity_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m jsonb; q jsonb; r jsonb; l record; n numeric; cap numeric; expected numeric; selected jsonb; total numeric:=0; seen text[]:=ARRAY[]::text[];
BEGIN
 SELECT definition->'manifest' INTO m FROM document_template_versions WHERE template_id=NEW.template_id AND version=NEW.template_version;
 q:=NEW.snapshot->'documentQuantities';
 IF m IS NULL THEN
  IF q IS NOT NULL THEN RAISE EXCEPTION 'LEGACY_DOCUMENT_SELECTION' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NOT coalesce(jsonb_typeof(q)='object' AND q ?& ARRAY['purpose','shipmentLineIds','lines'] AND q-ARRAY['purpose','shipmentLineIds','lines']='{}'::jsonb
 AND jsonb_typeof(q->'purpose')='string' AND q->>'purpose'=m->>'kind'
 AND jsonb_typeof(q->'lines')='array' AND jsonb_typeof(q->'shipmentLineIds')='array',false) THEN RAISE EXCEPTION 'INVALID_DOCUMENT_SELECTION' USING ERRCODE='23514'; END IF;
 selected:=q->'shipmentLineIds';
 IF (SELECT count(*) FROM jsonb_array_elements(selected))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements(selected))
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected) x WHERE jsonb_typeof(x)<>'string' OR NOT EXISTS(SELECT 1 FROM shipment_lines sl JOIN outbound_lines ol ON ol.id=sl.outbound_line_id WHERE ol.outbound_id=NEW.outbound_id AND sl.id::text=x#>>'{}'))
 OR (q->>'purpose'='instruction' AND jsonb_array_length(selected)<>0)
 OR jsonb_array_length(q->'lines')<>(SELECT count(*) FROM outbound_lines WHERE outbound_id=NEW.outbound_id)
 THEN RAISE EXCEPTION 'INVALID_DOCUMENT_SELECTION' USING ERRCODE='23514'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(q->'lines') LOOP
  IF NOT coalesce(jsonb_typeof(r)='object' AND r ?& ARRAY['lineId','quantity'] AND r-ARRAY['lineId','quantity']='{}'::jsonb AND document_string_fields(r,ARRAY['lineId','quantity']) AND r->>'quantity' ~ '^(0|[1-9][0-9]{0,18})$',false)
  OR r->>'lineId'=ANY(seen) THEN RAISE EXCEPTION 'INVALID_DOCUMENT_QUANTITY' USING ERRCODE='23514'; END IF;
  seen:=array_append(seen,r->>'lineId');
  SELECT * INTO l FROM outbound_lines WHERE outbound_id=NEW.outbound_id AND id::text=r->>'lineId' FOR SHARE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'INVALID_DOCUMENT_LINE' USING ERRCODE='23514'; END IF;
  n:=(r->>'quantity')::numeric;
  IF q->>'purpose'='instruction' THEN
   SELECT least(l.requested_qty-l.shipped_qty-l.cancelled_qty,coalesce(sum(quantity-consumed-released),0)) INTO cap FROM reservations WHERE outbound_line_id=l.id;
   IF n>cap OR (n>0 AND NEW.snapshot#>>'{outbound,state}' NOT IN ('reserved','partially_shipped')) THEN RAISE EXCEPTION 'EXCESS_DOCUMENT_QUANTITY' USING ERRCODE='23514'; END IF;
  ELSE
   SELECT coalesce(sum(shipped_qty),0) INTO expected FROM shipment_lines WHERE outbound_line_id=l.id AND selected @> jsonb_build_array(id::text);
   IF n<>expected THEN RAISE EXCEPTION 'INVALID_MANIFEST_QUANTITY' USING ERRCODE='23514'; END IF;
  END IF;
  total:=total+n;
 END LOOP;
 IF q->>'purpose'='instruction' AND EXISTS(SELECT 1 FROM outbound_lines ol JOIN skus s ON s.id=ol.sku_id JOIN products p ON p.id=s.product_id WHERE ol.outbound_id=NEW.outbound_id AND (s.status<>'active' OR p.status<>'active') UNION ALL SELECT 1 FROM warehouses WHERE id IN ((SELECT source_warehouse_id FROM outbounds WHERE id=NEW.outbound_id),(SELECT destination_warehouse_id FROM outbounds WHERE id=NEW.outbound_id)) AND status<>'active') THEN RAISE EXCEPTION 'INACTIVE_DOCUMENT_SOURCE' USING ERRCODE='23514'; END IF;
 IF total<=0 THEN RAISE EXCEPTION 'EMPTY_DOCUMENT_QUANTITY' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER document_quantity_source BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION document_quantity_insert();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION document_complete_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF jsonb_array_length(NEW.snapshot->'lines')=0 OR jsonb_array_length(NEW.snapshot->'lines')<>(SELECT count(*) FROM document_lines WHERE document_id=NEW.id)
 OR (SELECT count(*) FROM outbound_lines WHERE outbound_id=NEW.outbound_id)<>(SELECT count(*) FROM document_lines WHERE document_id=NEW.id)
 OR jsonb_array_length(NEW.snapshot->'sources')<>(SELECT count(*) FROM document_sources WHERE document_id=NEW.id)
 OR (SELECT count(*) FROM reservations r JOIN outbound_lines l ON l.id=r.outbound_line_id WHERE l.outbound_id=NEW.outbound_id)+(SELECT count(*) FROM shipment_lines sl JOIN outbound_lines l ON l.id=sl.outbound_line_id WHERE l.outbound_id=NEW.outbound_id)<>(SELECT count(*) FROM document_sources WHERE document_id=NEW.id)
 OR (SELECT count(*) FROM document_artifacts WHERE document_id=NEW.id AND state='pending')<>(CASE WHEN NEW.snapshot ? 'documentQuantities' THEN 1 ELSE 2 END)
 OR (NEW.snapshot ? 'documentQuantities' AND NOT EXISTS(SELECT 1 FROM document_artifacts a JOIN document_template_versions v ON v.template_id=NEW.template_id AND v.version=NEW.template_version WHERE a.document_id=NEW.id AND a.format=v.definition#>>'{manifest,format}'))
 OR NOT EXISTS(SELECT 1 FROM document_events WHERE document_id=NEW.id AND event='snapshot_created' AND actor_id=NEW.created_by)
 THEN RAISE EXCEPTION 'INCOMPLETE_DOCUMENT_SNAPSHOT' USING ERRCODE='23514'; END IF; RETURN NULL;
END $$;
