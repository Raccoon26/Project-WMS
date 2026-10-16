export const permissionCodes = [
  "users.read",
  "users.manage",
  "roles.read",
  "roles.manage",
  "audit.read",
  "system.read",
  "settings.read",
  "settings.manage",
  "products.read",
  "products.write",
  "inventory.read",
  "inventory.adjust",
  "outbound.read",
  "outbound.create",
  "outbound.approve",
  "procurement.read",
  "procurement.approve",
] as const;
export type Permission = (typeof permissionCodes)[number];
export const rolePolicies: Record<string, readonly Permission[]> = {
  Administrator: permissionCodes,
  Manager: [
    "system.read",
    "settings.read",
    "products.read",
    "products.write",
    "inventory.read",
    "inventory.adjust",
    "outbound.read",
    "outbound.create",
    "outbound.approve",
    "procurement.read",
  ],
  Operator: [
    "system.read",
    "products.read",
    "inventory.read",
    "outbound.read",
    "outbound.create",
  ],
  Viewer: [
    "system.read",
    "products.read",
    "inventory.read",
    "outbound.read",
    "procurement.read",
  ],
  Auditor: [
    "system.read",
    "audit.read",
    "products.read",
    "inventory.read",
    "outbound.read",
    "procurement.read",
  ],
};
export interface Grant {
  permission: string;
  scope: string;
  policyVersion: number;
}
export function allowed(
  grants: readonly Grant[],
  permission: Permission,
  warehouse?: string,
  knownWarehouses: readonly string[] = [],
): boolean {
  if (warehouse && !knownWarehouses.includes(warehouse)) return false;
  return grants.some(
    (g) =>
      g.permission === permission &&
      g.policyVersion === 1 &&
      (g.scope === "global" || g.scope === warehouse),
  );
}
export function recentReauth(at: Date | null, now = Date.now()): boolean {
  return at !== null && now - at.getTime() >= 0 && now - at.getTime() < 300000;
}
// Worker actors are explicit system identities, never inherited browser sessions.
export interface SystemActor {
  kind: "system";
  id: string;
  permissions: readonly Permission[];
}
