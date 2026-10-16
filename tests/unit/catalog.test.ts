import { it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  normalizeCatalogCode,
  externalCode,
  validCatalogTransition,
  catalogEligible,
  canonicalPayload,
} from "@wms/domain";
import {
  allowed,
  recentReauth,
  rolePolicies,
} from "../../apps/api/src/auth/policy";
import {
  CatalogService,
  definitions,
} from "../../apps/api/src/catalog/service";
import { catalogText } from "../../apps/web/src/catalog";
import { apiError, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@wms/contracts";
it.each([
  [" sku-a ", "SKU-A"],
  ["a.b_9", "A.B_9"],
  ["A".repeat(64), "A".repeat(64)],
])("normalizes internal catalog codes %s", (raw, expected) =>
  expect(normalizeCatalogCode(raw)).toBe(expected),
);
it.each(["", " ", "ＡＢＣ", "ß", "ı", "ﬀ", "A B", "A".repeat(65), "SKU';DROP"])(
  "rejects ambiguous or oversized internal code %s",
  (raw) => expect(() => normalizeCatalogCode(raw)).toThrow(),
);
it.each(["active", "inactive", "discontinued"])(
  "active product can transition to %s",
  (state) => expect(validCatalogTransition("active", state)).toBe(true),
);
it("discontinued identities are terminal and cannot silently be reused", () => {
  expect(validCatalogTransition("discontinued", "active")).toBe(false);
  expect(validCatalogTransition("inactive", "active")).toBe(true);
  expect(validCatalogTransition("active", "unknown")).toBe(false);
});
it("inactive parent product and warehouse block future business eligibility", () => {
  expect(catalogEligible("active", "active", "active")).toBe(true);
  for (const args of [
    ["inactive", "active", "active"],
    ["active", "inactive", "active"],
    ["active", "active", "inactive"],
  ])
    expect(catalogEligible(args[0]!, args[1]!, args[2]!)).toBe(false);
});
it("external codes preserve provider case and reject whitespace, controls and Unicode ambiguity", () => {
  expect(externalCode("Case-Sensitive:01")).toBe("Case-Sensitive:01");
  for (const x of [" a", "a b", "a\n", "Ａ", "x".repeat(101)])
    expect(() => externalCode(x)).toThrow();
});
it("canonical payload hashes ignore field ordering but retain exact values and array order", () => {
  expect(canonicalPayload({ b: 2, a: { z: 1, y: 3 } })).toBe(
    canonicalPayload({ a: { y: 3, z: 1 }, b: 2 }),
  );
  expect(canonicalPayload({ a: "sku" })).not.toBe(
    canonicalPayload({ a: "SKU" }),
  );
  expect(canonicalPayload([1, 2])).not.toBe(canonicalPayload([2, 1]));
});
it("warehouse grant cannot authorize global product or security mutation", () => {
  const g = [{ permission: "products.write", scope: "a", policyVersion: 1 }];
  expect(allowed(g, "products.write")).toBe(false);
  expect(allowed(g, "products.write", "a", ["a"])).toBe(true);
  expect(allowed(g, "products.write", "b", ["a", "b"])).toBe(false);
  expect(allowed([], "products.write", "a", ["a"])).toBe(false);
});
it("warehouse permission templates never grant user or role administration to managers", () => {
  expect(rolePolicies.Manager).toContain("locations.manage");
  expect(rolePolicies.Manager).not.toContain("roles.manage");
  expect(rolePolicies.Viewer).not.toContain("products.write");
  expect(rolePolicies.Viewer).toContain("warehouses.read");
});
it("mapping and role changes retain recent MFA expiration at five minutes", () => {
  const now = Date.now();
  expect(recentReauth(new Date(now - 299999), now)).toBe(true);
  expect(recentReauth(new Date(now - 300000), now)).toBe(false);
});
it("catalog: cursor pagination", () => {
  const service = new CatalogService({} as never, randomBytes(32));
  const data = {
    fingerprint: "bound-filter-and-grants",
    id: "00000000-0000-0000-0000-000000000001",
    value: "SKU-A",
  };
  const c = service.cursorEncode(data);
  expect(service.cursorDecode(c, data.fingerprint)).toMatchObject(data);
  for (const changed of [c + "tamper", "invalid", c.slice(1)])
    expect(() => service.cursorDecode(changed, data.fingerprint)).toThrow();
  expect(() => service.cursorDecode(c, "different-scope")).toThrow();
});
it("cursor signatures cannot be reused after encryption-key rotation", () => {
  const a = new CatalogService({} as never, randomBytes(32)),
    b = new CatalogService({} as never, randomBytes(32));
  expect(() => b.cursorDecode(a.cursorEncode({ id: "x" }), "filter")).toThrow();
});
it("sort columns are explicitly enumerated and never supplied as raw SQL", () => {
  expect(definitions.skus.sort).toEqual(["id", "code", "status"]);
  expect(definitions.products.sort).toContain("name_ja");
  expect(definitions.sku_mappings.fields).not.toContain("reviewed_by");
});
it("page size is an API bound, not a SKU bound, and relation errors are safe", () => {
  expect(DEFAULT_PAGE_SIZE).toBe(25);
  expect(MAX_PAGE_SIZE).toBe(100);
  expect(apiError("INVALID_RELATION", "safe").details).toBeNull();
});
it.each(["ja", "ko", "en"] as const)(
  "catalog and scope UI provide %s without unimplemented stock numbers",
  (locale) => {
    for (const k of [
      "products",
      "skus",
      "warehouses",
      "scope",
      "conflict",
      "unknown",
    ] as const)
      expect(catalogText(locale, k).length).toBeGreaterThan(0);
    expect(catalogText(locale, "unknown")).not.toMatch(/\b0\b/);
  },
);
it("future API handlers cannot opt out of default deny using the catalog flag", async () => {
  const { buildApi } = await import("../../apps/api/src/app");
  const { logger } = await import("@wms/runtime");
  const app = buildApi(
    { check: async () => true, close: async () => {} },
    logger("api", () => {}),
  );
  try {
    app.get(
      "/api/v1/undeclared-catalog",
      { config: { wmsCatalog: true } },
      () => ({ mustNotBePublic: true }),
    );
    const r = await app.inject("/api/v1/undeclared-catalog");
    expect(r.statusCode).toBe(401);
    expect(r.body).not.toContain("mustNotBePublic");
  } finally {
    await app.close();
  }
});
