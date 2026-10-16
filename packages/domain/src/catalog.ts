export const catalogStates = ["active", "inactive", "discontinued"] as const;
export type CatalogState = (typeof catalogStates)[number];
export function normalizeCatalogCode(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(trimmed))
    throw new Error("INVALID_INPUT");
  const normalized = trimmed.toUpperCase();
  return normalized;
}
export function validCatalogTransition(before: string, after: string): boolean {
  return (
    catalogStates.includes(after as CatalogState) &&
    (before !== "discontinued" || after === "discontinued")
  );
}
export function catalogEligible(
  product: string,
  sku: string,
  warehouse: string,
): boolean {
  return product === "active" && sku === "active" && warehouse === "active";
}
export function externalCode(value: string): string {
  // Provider identifiers are case-sensitive, never uppercased like internal SKU codes.
  if (!/^[!-~]{1,100}$/.test(value)) throw new Error("INVALID_INPUT");
  return value;
}
export function canonicalPayload(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value))
    return "[" + value.map(canonicalPayload).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonicalPayload(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
