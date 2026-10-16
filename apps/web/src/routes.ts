export const routes = [
  ["/", "dashboard"],
  ["/products", "products"],
  ["/inventory", "inventory"],
  ["/warehouses", "warehouses"],
  ["/inbound", "inbound"],
  ["/outbound", "outbound"],
  ["/transfers", "transfers"],
  ["/procurement", "procurement"],
  ["/analytics", "analytics"],
  ["/automation", "automation"],
  ["/approvals", "approvals"],
  ["/activity-logs", "activity"],
  ["/integrations", "integrations"],
  ["/system-health", "health"],
  ["/settings", "settings"],
] as const;
export type RouteKey = (typeof routes)[number][1];
export function routeFor(path: string) {
  return routes.find(([p]) => p === path);
}
