CREATE TABLE "document_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"format" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text,
	"byte_size" bigint,
	"renderer_version" text,
	"revision" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_artifacts_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "document_artifact_format" UNIQUE("document_id","format"),
	CONSTRAINT "document_artifact_identity" UNIQUE("id","document_id")
);
--> statement-breakpoint
CREATE TABLE "document_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"artifact_id" uuid,
	"artifact_revision" bigint,
	"state" text,
	"sequence" bigint NOT NULL,
	"event" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_event_sequence" UNIQUE("document_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "document_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"outbound_id" uuid NOT NULL,
	"outbound_line_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "document_line_identity" UNIQUE("document_id","outbound_line_id")
);
--> statement-breakpoint
CREATE TABLE "document_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"outbound_line_id" uuid NOT NULL,
	"reservation_id" uuid,
	"shipment_line_id" uuid,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_template_versions" (
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"canonical" text NOT NULL,
	"sha256" text NOT NULL,
	"sample" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_template_version" PRIMARY KEY("template_id","version")
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"outbound_id" uuid NOT NULL,
	"outbound_version" bigint NOT NULL,
	"content_version" bigint NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"locale" text NOT NULL,
	"sample" boolean DEFAULT true NOT NULL,
	"snapshot" jsonb NOT NULL,
	"canonical" text NOT NULL,
	"snapshot_sha256" text NOT NULL,
	"created_by" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"origin_xid" bigint DEFAULT txid_current() NOT NULL,
	CONSTRAINT "document_content_version" UNIQUE("outbound_id","content_version"),
	CONSTRAINT "document_actor_key" UNIQUE("created_by","idempotency_key"),
	CONSTRAINT "document_outbound_identity" UNIQUE("id","outbound_id")
);
--> statement-breakpoint
ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_artifact_id_document_id_document_artifacts_id_document_id_fk" FOREIGN KEY ("artifact_id","document_id") REFERENCES "document_artifacts"("id","document_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_outbound_line_id_outbound_lines_id_fk" FOREIGN KEY ("outbound_line_id") REFERENCES "outbound_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_document_id_outbound_id_documents_id_outbound_id_fk" FOREIGN KEY ("document_id","outbound_id") REFERENCES "documents"("id","outbound_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sources" ADD CONSTRAINT "document_sources_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sources" ADD CONSTRAINT "document_sources_shipment_line_id_shipment_lines_id_fk" FOREIGN KEY ("shipment_line_id") REFERENCES "shipment_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sources" ADD CONSTRAINT "document_sources_document_id_outbound_line_id_document_lines_document_id_outbound_line_id_fk" FOREIGN KEY ("document_id","outbound_line_id") REFERENCES "document_lines"("document_id","outbound_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_outbound_id_outbounds_id_fk" FOREIGN KEY ("outbound_id") REFERENCES "outbounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_template_id_template_version_document_template_versions_template_id_version_fk" FOREIGN KEY ("template_id","template_version") REFERENCES "document_template_versions"("template_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Custom SQL owns immutable historical, source consistency and storage lifecycle guards.
ALTER TABLE document_templates ADD CONSTRAINT document_template_fields CHECK(code ~ '^[a-z][a-z0-9-]{0,63}$' AND kind IN ('instruction','manifest'));
ALTER TABLE document_template_versions ADD CONSTRAINT document_version_fields CHECK((version>0 AND sample AND jsonb_typeof(definition)='object' AND definition=canonical::jsonb AND definition->>'renderer'='sample-grid-v1' AND definition->>'watermark'='SAMPLE / サンプル / 샘플' AND octet_length(canonical)<=16384 AND sha256 ~ '^[0-9a-f]{64}$' AND sha256=encode(sha256(convert_to(canonical,'UTF8')),'hex')) IS TRUE);
ALTER TABLE documents ADD CONSTRAINT document_fields CHECK((outbound_version>0 AND content_version>0 AND sample AND locale IN ('ja','ko','en') AND payload_hash ~ '^[0-9a-f]{64}$' AND idempotency_key ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' AND snapshot_sha256 ~ '^[0-9a-f]{64}$' AND snapshot_sha256=encode(sha256(convert_to(canonical,'UTF8')),'hex') AND octet_length(canonical)<=2097152 AND snapshot=canonical::jsonb AND jsonb_typeof(snapshot)='object' AND snapshot->>'schemaVersion'='1' AND snapshot->>'documentId'=id::text AND snapshot->>'actorId'=created_by::text AND snapshot->>'sample'='true' AND snapshot->>'locale'=locale AND snapshot#>>'{outbound,id}'=outbound_id::text AND snapshot#>>'{outbound,version}'=outbound_version::text AND snapshot#>>'{template,id}'=template_id::text AND snapshot#>>'{template,version}'=template_version::text AND jsonb_typeof(snapshot->'lines')='array' AND jsonb_typeof(snapshot->'sources')='array') IS TRUE);
ALTER TABLE document_sources ADD CONSTRAINT document_source_xor CHECK((reservation_id IS NULL)<>(shipment_line_id IS NULL));
CREATE UNIQUE INDEX document_source_reservation ON document_sources(document_id,reservation_id) WHERE reservation_id IS NOT NULL;
CREATE UNIQUE INDEX document_source_shipment ON document_sources(document_id,shipment_line_id) WHERE shipment_line_id IS NOT NULL;
ALTER TABLE document_artifacts ADD CONSTRAINT document_artifact_fields CHECK((format IN ('xlsx','pdf') AND state IN ('pending','staged','ready','missing','corrupt','failed') AND revision>0 AND storage_key=id::text||'.'||format AND (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$') AND (byte_size IS NULL OR byte_size BETWEEN 1 AND 26214400) AND ((sha256 IS NULL AND byte_size IS NULL AND renderer_version IS NULL AND state IN ('pending','failed')) OR (sha256 IS NOT NULL AND byte_size IS NOT NULL AND length(renderer_version) BETWEEN 1 AND 100 AND state<>'pending'))) IS TRUE);
ALTER TABLE document_events ADD CONSTRAINT document_event_fields CHECK((sequence>0 AND length(request_id) BETWEEN 1 AND 128 AND ((artifact_id IS NULL AND artifact_revision IS NULL AND state IS NULL AND event='snapshot_created') OR (artifact_id IS NOT NULL AND artifact_revision>0 AND state IN ('staged','ready','missing','corrupt','failed') AND event='artifact_'||state))) IS TRUE);
CREATE UNIQUE INDEX document_initial_event ON document_events(document_id) WHERE event='snapshot_created';
CREATE UNIQUE INDEX document_artifact_event_revision ON document_events(artifact_id,artifact_revision) WHERE artifact_id IS NOT NULL;
CREATE INDEX document_template_creator ON document_templates(created_by);
CREATE INDEX document_version_creator ON document_template_versions(created_by);
CREATE INDEX document_version_history ON documents(template_id,template_version);
CREATE INDEX document_history_actor ON documents(created_by,id);
CREATE INDEX document_history_outbound ON documents(outbound_id,id);
CREATE INDEX document_line_outbound ON document_lines(outbound_line_id);
CREATE INDEX document_line_sku ON document_lines(sku_id);
CREATE INDEX document_source_reservation_fk ON document_sources(reservation_id);
CREATE INDEX document_source_shipment_fk ON document_sources(shipment_line_id);
CREATE INDEX document_event_actor ON document_events(actor_id);
--> statement-breakpoint
CREATE FUNCTION document_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_DOCUMENT' USING ERRCODE='23514'; END $$;
CREATE TRIGGER document_version_immutable BEFORE UPDATE OR DELETE ON document_template_versions FOR EACH ROW EXECUTE FUNCTION document_immutable();
CREATE TRIGGER document_snapshot_immutable BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION document_immutable();
CREATE TRIGGER document_line_immutable BEFORE UPDATE OR DELETE ON document_lines FOR EACH ROW EXECUTE FUNCTION document_immutable();
CREATE TRIGGER document_source_immutable BEFORE UPDATE OR DELETE ON document_sources FOR EACH ROW EXECUTE FUNCTION document_immutable();
CREATE TRIGGER document_event_immutable BEFORE UPDATE OR DELETE ON document_events FOR EACH ROW EXECUTE FUNCTION document_immutable();
CREATE TRIGGER document_template_no_delete BEFORE DELETE ON document_templates FOR EACH ROW EXECUTE FUNCTION document_immutable();
CREATE TRIGGER document_artifact_no_delete BEFORE DELETE ON document_artifacts FOR EACH ROW EXECUTE FUNCTION document_immutable();
CREATE FUNCTION document_template_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'active') IS DISTINCT FROM (to_jsonb(OLD)-'active') THEN RAISE EXCEPTION 'IMMUTABLE_TEMPLATE_IDENTITY' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER document_template_identity BEFORE UPDATE ON document_templates FOR EACH ROW EXECUTE FUNCTION document_template_update();
--> statement-breakpoint
CREATE FUNCTION document_header_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o record; t record;
BEGIN
 SELECT * INTO o FROM outbounds WHERE id=NEW.outbound_id FOR SHARE;
 SELECT v.sha256,h.kind,h.active INTO t FROM document_template_versions v JOIN document_templates h ON h.id=v.template_id WHERE v.template_id=NEW.template_id AND v.version=NEW.template_version FOR SHARE OF v,h;
 IF o.id IS NULL OR t.sha256 IS NULL OR NOT t.active OR NEW.outbound_version<>o.version OR NEW.origin_xid<>txid_current()
 OR NEW.snapshot#>>'{template,sha256}' IS DISTINCT FROM t.sha256 OR NEW.snapshot#>>'{template,kind}' IS DISTINCT FROM t.kind
 OR NEW.snapshot#>>'{outbound,source,id}' IS DISTINCT FROM o.source_warehouse_id::text OR NEW.snapshot#>>'{outbound,destination,id}' IS DISTINCT FROM o.destination_warehouse_id::text
 OR NEW.snapshot#>'{outbound,source}' IS DISTINCT FROM (SELECT jsonb_build_object('id',id::text,'code',code,'name',name,'type',type) FROM warehouses WHERE id=o.source_warehouse_id) OR NEW.snapshot#>'{outbound,destination}' IS DISTINCT FROM (SELECT jsonb_build_object('id',id::text,'code',code,'name',name,'type',type) FROM warehouses WHERE id=o.destination_warehouse_id)
 OR NEW.snapshot#>>'{outbound,state}' IS DISTINCT FROM o.state OR NEW.snapshot#>>'{outbound,businessRef}' IS DISTINCT FROM o.business_ref
 THEN RAISE EXCEPTION 'INVALID_DOCUMENT_SOURCE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER document_header_source BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION document_header_insert();
--> statement-breakpoint
CREATE FUNCTION document_child_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d record; l record; src record; a numeric; r numeric;
BEGIN
 SELECT * INTO d FROM documents WHERE id=NEW.document_id FOR SHARE;
 IF d.id IS NULL OR d.origin_xid<>txid_current() THEN RAISE EXCEPTION 'COMMITTED_DOCUMENT_CLOSED' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='document_artifacts' THEN
   IF NEW.state<>'pending' OR NEW.revision<>1 THEN RAISE EXCEPTION 'INVALID_INITIAL_ARTIFACT' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 SELECT * INTO l FROM outbound_lines WHERE id=NEW.outbound_line_id FOR SHARE;
 IF l.id IS NULL OR l.outbound_id<>d.outbound_id THEN RAISE EXCEPTION 'UNRELATED_DOCUMENT_LINE' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='document_lines' THEN
  SELECT coalesce(sum(shipped_qty-received_qty),0),coalesce(sum(received_qty),0) INTO a,r FROM shipment_lines WHERE outbound_line_id=l.id;
  IF NEW.outbound_id<>d.outbound_id OR NEW.sku_id<>l.sku_id OR NEW.snapshot->>'id' IS DISTINCT FROM l.id::text OR NEW.snapshot->>'skuId' IS DISTINCT FROM l.sku_id::text
   OR NEW.snapshot->>'skuCode' IS DISTINCT FROM (SELECT code FROM skus WHERE id=l.sku_id) OR NEW.snapshot->>'productName' IS DISTINCT FROM (SELECT p.name_ja FROM products p JOIN skus s ON s.product_id=p.id WHERE s.id=l.sku_id)
   OR NEW.snapshot->>'requested' IS DISTINCT FROM l.requested_qty::text OR NEW.snapshot->>'cancelled' IS DISTINCT FROM l.cancelled_qty::text OR NEW.snapshot->>'shipped' IS DISTINCT FROM l.shipped_qty::text
   OR NEW.snapshot->>'remaining' IS DISTINCT FROM (l.requested_qty-l.cancelled_qty-l.shipped_qty)::text OR NEW.snapshot->>'transit' IS DISTINCT FROM a::text OR NEW.snapshot->>'received' IS DISTINCT FROM r::text
   OR NEW.snapshot->>'reserved' IS DISTINCT FROM (SELECT coalesce(sum(quantity-consumed-released),0)::text FROM reservations WHERE outbound_line_id=l.id)
   OR NOT (d.snapshot->'lines' @> jsonb_build_array(NEW.snapshot)) THEN RAISE EXCEPTION 'INVALID_DOCUMENT_LINE_QUANTITIES' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.reservation_id IS NOT NULL THEN
   SELECT * INTO src FROM reservations WHERE id=NEW.reservation_id FOR SHARE;
   IF src.id IS NULL OR src.outbound_line_id<>l.id OR NEW.snapshot->>'reservationId' IS DISTINCT FROM src.id::text OR NEW.snapshot->>'quantity' IS DISTINCT FROM src.quantity::text OR NEW.snapshot->>'consumed' IS DISTINCT FROM src.consumed::text OR NEW.snapshot->>'released' IS DISTINCT FROM src.released::text OR NEW.snapshot->>'received' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'INVALID_RESERVATION_REFERENCE' USING ERRCODE='23514'; END IF;
  ELSE
   SELECT * INTO src FROM shipment_lines WHERE id=NEW.shipment_line_id FOR SHARE;
   IF src.id IS NULL OR src.outbound_line_id<>l.id OR NEW.snapshot->>'shipmentLineId' IS DISTINCT FROM src.id::text OR NEW.snapshot->>'quantity' IS DISTINCT FROM src.shipped_qty::text OR NEW.snapshot->>'received' IS DISTINCT FROM src.received_qty::text OR NEW.snapshot->>'consumed' IS DISTINCT FROM '0' OR NEW.snapshot->>'released' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'INVALID_SHIPMENT_REFERENCE' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.snapshot->>'lineId' IS DISTINCT FROM l.id::text OR (NEW.snapshot->>'reservationId') IS DISTINCT FROM NEW.reservation_id::text OR (NEW.snapshot->>'shipmentLineId') IS DISTINCT FROM NEW.shipment_line_id::text OR NOT(d.snapshot->'sources' @> jsonb_build_array(NEW.snapshot)) THEN RAISE EXCEPTION 'INVALID_DOCUMENT_SOURCE_SNAPSHOT' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER document_line_source BEFORE INSERT ON document_lines FOR EACH ROW EXECUTE FUNCTION document_child_insert();
CREATE TRIGGER document_source_source BEFORE INSERT ON document_sources FOR EACH ROW EXECUTE FUNCTION document_child_insert();
CREATE TRIGGER document_artifact_initial BEFORE INSERT ON document_artifacts FOR EACH ROW EXECUTE FUNCTION document_child_insert();
--> statement-breakpoint
CREATE FUNCTION document_complete_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF jsonb_array_length(NEW.snapshot->'lines')=0 OR jsonb_array_length(NEW.snapshot->'lines')<>(SELECT count(*) FROM document_lines WHERE document_id=NEW.id)
 OR (SELECT count(*) FROM outbound_lines WHERE outbound_id=NEW.outbound_id)<>(SELECT count(*) FROM document_lines WHERE document_id=NEW.id)
 OR jsonb_array_length(NEW.snapshot->'sources')<>(SELECT count(*) FROM document_sources WHERE document_id=NEW.id)
 OR (SELECT count(*) FROM reservations r JOIN outbound_lines l ON l.id=r.outbound_line_id WHERE l.outbound_id=NEW.outbound_id)+(SELECT count(*) FROM shipment_lines sl JOIN outbound_lines l ON l.id=sl.outbound_line_id WHERE l.outbound_id=NEW.outbound_id)<>(SELECT count(*) FROM document_sources WHERE document_id=NEW.id)
 OR (SELECT count(*) FROM document_artifacts WHERE document_id=NEW.id AND state='pending')<>2
 OR NOT EXISTS(SELECT 1 FROM document_events WHERE document_id=NEW.id AND event='snapshot_created' AND actor_id=NEW.created_by)
 THEN RAISE EXCEPTION 'INCOMPLETE_DOCUMENT_SNAPSHOT' USING ERRCODE='23514'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER document_complete AFTER INSERT ON documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION document_complete_commit();
--> statement-breakpoint
CREATE FUNCTION document_artifact_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['state','sha256','byte_size','renderer_version','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','sha256','byte_size','renderer_version','revision']) OR NEW.revision<>OLD.revision+1
 OR NOT ((OLD.state='pending' AND NEW.state IN ('staged','failed')) OR (OLD.state='staged' AND NEW.state IN ('ready','failed')) OR (OLD.state='ready' AND NEW.state IN ('missing','corrupt')) OR (OLD.state IN ('missing','corrupt') AND NEW.state='ready'))
 OR (OLD.sha256 IS NOT NULL AND (NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.byte_size IS DISTINCT FROM OLD.byte_size OR NEW.renderer_version IS DISTINCT FROM OLD.renderer_version))
 THEN RAISE EXCEPTION 'INVALID_ARTIFACT_TRANSITION' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER document_artifact_transition BEFORE UPDATE ON document_artifacts FOR EACH ROW EXECUTE FUNCTION document_artifact_update();
CREATE FUNCTION document_artifact_event_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM document_events WHERE artifact_id=NEW.id AND artifact_revision=NEW.revision AND state=NEW.state AND document_id=NEW.document_id) THEN RAISE EXCEPTION 'MISSING_ARTIFACT_EVENT' USING ERRCODE='23514'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER document_artifact_event AFTER UPDATE ON document_artifacts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION document_artifact_event_commit();
