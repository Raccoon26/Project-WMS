import type { UtcTimestamp } from "@wms/domain";
export type ErrorCode =
  "NOT_FOUND" | "INVALID_INPUT" | "INTERNAL_ERROR" | "SERVICE_UNAVAILABLE";
export interface ApiError {
  code: ErrorCode;
  messageKey: string;
  requestId: string;
  retryable: boolean;
  details: null;
}
const messageKeys: Record<ErrorCode, string> = {
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
