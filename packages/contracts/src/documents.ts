/** DEV05-1 contracts. Renderers/stores/HTTP/email adapters are not installed yet. */
export type DocumentFormat = "xlsx" | "pdf";
export type DocumentLocale = "ja" | "ko" | "en";
export type DocumentKind = "instruction" | "manifest";
export interface SampleTemplateDefinition {
  renderer: "sample-grid-v1";
  title: Record<DocumentLocale, string>;
  footer: Record<DocumentLocale, string>;
  watermark: "SAMPLE / サンプル / 샘플";
  columns: readonly (
    | "sku"
    | "product"
    | "requested"
    | "remaining"
    | "shipped"
    | "received"
    | "reserved"
    | "transit"
  )[];
}
export interface DocumentTemplateVersion {
  templateId: string;
  version: number;
  kind: DocumentKind;
  definition: SampleTemplateDefinition;
  sha256: string;
  sample: true;
}
export interface DocumentSnapshotLine {
  id: string;
  skuId: string;
  skuCode: string;
  productName: string;
  requested: string;
  cancelled: string;
  remaining: string;
  shipped: string;
  received: string;
  reserved: string;
  transit: string;
}
export interface DocumentSnapshotSource {
  lineId: string;
  reservationId: string | null;
  shipmentLineId: string | null;
  quantity: string;
  consumed: string;
  released: string;
  received: string;
}
export interface OutboundDocumentSnapshot {
  schemaVersion: 1;
  documentId: string;
  capturedAt: string;
  actorId: string;
  sample: true;
  locale: DocumentLocale;
  template: { id: string; version: number; sha256: string; kind: DocumentKind };
  outbound: {
    id: string;
    version: string;
    businessRef: string;
    state: string;
    source: { id: string; code: string; name: string; type: string };
    destination: { id: string; code: string; name: string; type: string };
  };
  lines: readonly DocumentSnapshotLine[];
  sources: readonly DocumentSnapshotSource[];
}
/** Must use the caller's authorized, locked DB transaction; no inventory writes. */
export interface SnapshotBuilder<TTransaction> {
  build(
    transaction: TTransaction,
    input: {
      documentId: string;
      actorId: string;
      outboundId: string;
      outboundVersion: string;
      template: DocumentTemplateVersion;
      locale: DocumentLocale;
    },
  ): Promise<OutboundDocumentSnapshot>;
}
/** Only allowlisted data definitions; never execute uploaded JS/macros/HTML/network URLs. */
export interface TemplateRenderer {
  readonly version: string;
  render(
    template: DocumentTemplateVersion,
    snapshot: OutboundDocumentSnapshot,
    format: DocumentFormat,
  ): Promise<Uint8Array>;
}
export interface ArtifactIdentity {
  id: string;
  key: string;
  sha256: string;
  byteSize: string;
  format: DocumentFormat;
}
/** DB and storage are NOT one transaction. Never overwrite an existing published object.
 * stage -> DB fenced metadata -> publish+fsync -> verify -> DB ready/event/audit.
 * read/restore MUST verify exact bytes/hash/size and reject links/traversal.
 * A crash leaves staging/orphans/missing states for reconciliation, never auto-dispatch.
 */
export interface ArtifactStore {
  stage(
    identity: ArtifactIdentity,
    bytes: Uint8Array,
  ): Promise<{ stagingId: string }>;
  publish(identity: ArtifactIdentity, stagingId: string): Promise<void>;
  verify(
    identity: ArtifactIdentity,
  ): Promise<"verified" | "missing" | "corrupt">;
  readVerified(identity: ArtifactIdentity): Promise<Uint8Array>;
  restoreExact(identity: ArtifactIdentity, bytes: Uint8Array): Promise<void>;
}
/** Data reference only, not permission or a send capability. DEV06 must reauthorize,
 * reject sample/stale/unapproved/unverified artifacts, and bind approval+delivery hash. */
export interface DocumentReference {
  documentId: string;
  outboundId: string;
  outboundVersion: string;
  templateId: string;
  templateVersion: number;
  snapshotSha256: string;
  contentVersion: string;
  sample: true;
  dispatchable: false;
}
