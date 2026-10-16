// Only these installed adapters may defer global guards to resolved-scope UoW checks.
// A future endpoint cannot opt out merely by setting wmsCatalog=true.
const roots = ["products", "skus", "warehouses", "integration-accounts"];
export const catalogRouteKeys = new Set([
  ...roots.flatMap((p) => [
    "GET /api/v1/" + p,
    "POST /api/v1/" + p,
    "GET /api/v1/" + p + "/:id",
    "PATCH /api/v1/" + p + "/:id",
    "GET /api/v1/" + p + "/:id/history",
  ]),
  "GET /api/v1/warehouses/:parent/locations",
  "POST /api/v1/warehouses/:parent/locations",
  "PATCH /api/v1/locations/:id",
  "GET /api/v1/locations/:id/history",
  "GET /api/v1/skus/:parent/mappings",
  "POST /api/v1/skus/:parent/mappings",
  "PATCH /api/v1/mappings/:id",
  "GET /api/v1/mappings/:id/history",
  "GET /api/v1/users/:id/grants",
  "PUT /api/v1/users/:id/warehouse-roles",
]);
