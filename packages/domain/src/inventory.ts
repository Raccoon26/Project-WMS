/** Canonical signed PostgreSQL bigint. No Number conversion on quantity paths. */
export const inventoryMax = 9223372036854775807n;
export function quantity(value: string, positive = true): bigint {
  if (!/^(0|[1-9][0-9]{0,18})$/.test(value))
    throw new Error("INVALID_QUANTITY");
  const q = BigInt(value);
  if (q > inventoryMax || (positive && q === 0n))
    throw new Error("INVALID_QUANTITY");
  return q;
}
export type InventoryKind =
  "good" | "damaged" | "quarantine" | "transit" | "external_boundary";
export function balanced(
  entries: readonly { sku: string; quantity: bigint }[],
): boolean {
  const sums = new Map<string, bigint>();
  for (const e of entries) {
    if (e.quantity === 0n) return false;
    sums.set(e.sku, (sums.get(e.sku) ?? 0n) + e.quantity);
  }
  return entries.length >= 2 && [...sums.values()].every((v) => v === 0n);
}
export function stock(
  good: bigint,
  damaged: bigint,
  quarantine: bigint,
  reserved: bigint,
  transit: bigint,
) {
  if (
    [good, damaged, quarantine, reserved, transit].some(
      (q) => q < 0n || q > inventoryMax,
    ) ||
    good < reserved
  )
    throw new Error("INVALID_BALANCE");
  return {
    good,
    damaged,
    quarantine,
    reserved,
    available: good - reserved,
    physical: good + damaged + quarantine,
    transit,
    owned: good + damaged + quarantine + transit,
  };
}
export function remaining(requested: bigint, shipped: bigint, cancelled = 0n) {
  if (
    requested <= 0n ||
    shipped < 0n ||
    cancelled < 0n ||
    shipped + cancelled > requested
  )
    throw new Error("INVALID_PROGRESS");
  return requested - shipped - cancelled;
}
export function reclassification(from: InventoryKind, to: InventoryKind) {
  return new Set([
    "good:damaged",
    "good:quarantine",
    "quarantine:good",
    "damaged:quarantine",
  ]).has(from + ":" + to);
}
export function retryInventoryTransaction(
  code: string | undefined,
  attempt: number,
) {
  return ["40P01", "40001"].includes(code ?? "") && attempt < 2;
}
export function reservationRemaining(
  reserved: bigint,
  consumed: bigint,
  released: bigint,
) {
  if (
    reserved <= 0n ||
    consumed < 0n ||
    released < 0n ||
    consumed + released > reserved
  )
    throw new Error("INVALID_RESERVATION");
  return reserved - consumed - released;
}
export function canReleaseReservation(state: string) {
  return state === "draft" || state === "reserved";
}
