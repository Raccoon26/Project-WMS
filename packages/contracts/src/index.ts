import type { UtcTimestamp } from "@wms/domain";
export type ErrorCode =
  | "INVALID_RELATION"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "REAUTH_REQUIRED";
export interface ApiError {
  code: ErrorCode;
  messageKey: string;
  requestId: string;
  retryable: boolean;
  details: null;
}
const messageKeys: Record<ErrorCode, string> = {
  INVALID_RELATION: "catalog.invalidRelation",
  UNAUTHORIZED: "auth.unauthorized",
  FORBIDDEN: "auth.forbidden",
  CONFLICT: "auth.conflict",
  RATE_LIMITED: "auth.rateLimited",
  REAUTH_REQUIRED: "auth.reauthRequired",
  NOT_FOUND: "errors.notFound",
  INVALID_INPUT: "errors.invalidInput",
  INTERNAL_ERROR: "errors.internal",
  SERVICE_UNAVAILABLE: "errors.serviceUnavailable",
};
export function apiError(code: ErrorCode, requestId: string): ApiError {
  return {
    code,
    messageKey: messageKeys[code],
    requestId,
    retryable: code === "SERVICE_UNAVAILABLE",
    details: null,
  };
}
export interface ServiceStatus {
  status: "ok";
  service: "api" | "worker";
  checkedAt: UtcTimestamp;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  asOf: UtcTimestamp;
}
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export function pageSize(value: unknown = DEFAULT_PAGE_SIZE): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_PAGE_SIZE
  )
    throw new Error("INVALID_PAGE_SIZE");
  return value;
}
export function utcNow(): UtcTimestamp {
  return new Date().toISOString() as UtcTimestamp;
}
export interface DatabaseProbe {
  check(): Promise<boolean>;
  close(): Promise<void>;
}

// Browser DTO contains identity and current grants, never an opaque token or credential.
export interface AuthenticatedIdentity {
  id: string;
  login: string;
  displayName: string;
  locale: string;
  mfaEnabled: boolean;
  expiresAt: string;
  roles: string[];
  permissions: string[];
  grants?: { permission: string; scope: string; policyVersion: number }[];
}
// Future OIDC adapters may prove a subject, but cannot assign permissions or sessions.
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  verifiedAt: string;
  methods: readonly string[];
}
export interface IdentityProvider {
  readonly kind: "local" | "oidc";
  verify(assertion: unknown): Promise<VerifiedIdentity | null>;
}

// Worker identities are explicit; a browser session/role is never inherited.
export interface SystemActor {
  readonly kind: "system";
  readonly id: string;
  readonly permissions: readonly string[];
}

// Catalog DTOs carry metadata only: no inferred stock balances or provider verification.
export interface CatalogRecord {
  id: string;
  version: number;
  status: string;
  created_at: string;
  updated_at: string;
}
export interface ProductDto extends CatalogRecord {
  name_ja: string;
  name_ko: string | null;
  name_en: string | null;
  description: string | null;
}
export interface SkuDto extends CatalogRecord {
  product_id: string;
  code: string;
  barcode: string | null;
  catalog_active?: boolean;
}
export interface WarehouseDto extends CatalogRecord {
  code: string;
  name: string;
  type: "external_email" | "internal" | "fba" | "rsl";
  adapter_config_ref: string | null;
}

// DEV04 wire quantities are canonical decimal strings; never JSON bigint/Number.
export type InventoryEvidenceTrust =
  | "synthetic_test"
  | "local_manual"
  | "external_unverified"
  | "validated"
  | "rejected"
  | "quarantined";
export interface InventoryBalanceDto {
  id: string;
  sku_id: string;
  warehouse_id: string | null;
  location_id: string | null;
  shipment_id: string | null;
  kind: import("@wms/domain").InventoryKind;
  quantity: string;
  reserved: string;
  available: string;
  version: string;
  updated_at: string;
}
export interface InventoryEvidenceReference {
  id: string;
  source: string;
  sourceEventId: string;
  skuId: string;
  quantity: string;
  warehouseId: string;
  shipmentId: string | null;
  occurredAt: string;
  receivedAt: string;
  actorId: string;
  payloadHash: string;
  trust: InventoryEvidenceTrust;
}
/** Future provider adapters supply independently checked proof, never a client verified=true flag. */
export interface InventoryEvidenceVerificationPort {
  verify(
    reference: Readonly<InventoryEvidenceReference>,
  ): Promise<{
    decision: "held" | "rejected" | "validated";
    proofReference: string | null;
  }>;
}
export interface InventoryInternalEvent {
  id: string;
  aggregateId: string;
  aggregateVersion: string;
  topic: string;
  payloadHash: string;
  correlationId: string;
  causationId: string;
  createdAt: string;
  status: "pending" | "held" | "consumed";
}
