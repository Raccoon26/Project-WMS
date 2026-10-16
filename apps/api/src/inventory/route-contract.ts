// Explicit transport allowlist. Resolved warehouse permission is checked again inside InventoryService UoW.
// Keeping this module independent of HTTP/Auth adapters avoids a module import cycle.
const roots = [
  "inventory",
  "inventory/balances",
  "inventory/transactions",
  "reservations",
  "outbounds",
  "inbounds",
  "transfers",
  "reconciliations",
];
export const inventoryRouteKeys = new Set([
  ...roots.flatMap((p) => ["GET /api/v1/" + p, "GET /api/v1/" + p + "/:id"]),
  ...[
    "inventory/openings",
    "inventory/reclassifications",
    "inventory/reversals",
    "inventory/adjustments",
    "reconciliations",
    "outbounds",
    "transfers",
    "outbounds/:id/reserve",
    "outbounds/:id/release",
    "outbounds/:id/cancel",
    "outbounds/:id/shipments",
    "inbounds/:id/receipts",
  ].map((p) => "POST /api/v1/" + p),
  "PATCH /api/v1/outbounds/:id",
  "GET /api/v1/inventory/summary",
  "GET /api/v1/outbounds/:id/shipments",
  "GET /api/v1/inbounds/:id/receipts",
]);
