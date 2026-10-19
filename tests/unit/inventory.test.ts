import { it, expect } from "vitest";
import {
  quantity,
  inventoryMax,
  balanced,
  stock,
  remaining,
  reclassification,
  retryInventoryTransaction,
} from "@wms/domain";
import { inventoryHash } from "../../apps/api/src/inventory/service";
it("inventory quantities preserve bigint beyond Number precision", () => {
  expect(quantity("9007199254740993")).toBe(9007199254740993n);
  expect(quantity(inventoryMax.toString())).toBe(inventoryMax);
});
it.each([
  "-1",
  "0",
  "0001",
  "1.0",
  "1e3",
  "NaN",
  "Infinity",
  "9223372036854775808",
  "-0",
  " 1",
  "+1",
])("rejects noncanonical or overflowing inventory quantity %s", (q) => {
  expect(() => quantity(q)).toThrow();
});
it("inventory SKU balance cannot cross-offset quantities", () => {
  expect(
    balanced([
      { sku: "a", quantity: -3n },
      { sku: "b", quantity: 3n },
    ]),
  ).toBe(false);
  expect(
    balanced([
      { sku: "a", quantity: -3n },
      { sku: "a", quantity: 3n },
    ]),
  ).toBe(true);
  expect(balanced([])).toBe(false);
});
it("physical reserved available and transit are not added twice", () => {
  expect(stock(5n, 0n, 0n, 5n, 95n)).toEqual({
    good: 5n,
    damaged: 0n,
    quarantine: 0n,
    reserved: 5n,
    available: 0n,
    physical: 5n,
    transit: 95n,
    owned: 100n,
  });
  expect(() => stock(1n, 0n, 0n, 2n, 0n)).toThrow();
});
it("partial progress is bounded and remains exact", () => {
  expect(remaining(100n, 95n)).toBe(5n);
  expect(() => remaining(100n, 101n)).toThrow();
});
it("only documented reclassification transitions are allowed", () => {
  expect(reclassification("quarantine", "good")).toBe(true);
  expect(reclassification("damaged", "good")).toBe(false);
  expect(reclassification("good", "transit")).toBe(false);
});
it("hashes are deterministic and evidence mutations are distinguishable", () => {
  expect(inventoryHash({ b: "2", a: "1" })).toBe(
    inventoryHash({ a: "1", b: "2" }),
  );
  expect(inventoryHash({ q: "1" })).not.toBe(inventoryHash({ q: "2" }));
});
it("only rollback-safe database races have bounded retries", () => {
  expect(retryInventoryTransaction("40P01", 0)).toBe(true);
  expect(retryInventoryTransaction("40001", 1)).toBe(true);
  expect(retryInventoryTransaction("40P01", 2)).toBe(false);
  expect(retryInventoryTransaction("ECONNRESET", 0)).toBe(false);
});
import { reservationRemaining, canReleaseReservation } from "@wms/domain";
import { allowed } from "../../apps/api/src/auth/policy";
it("consumption and release cannot exceed the original reservation", () => {
  expect(reservationRemaining(100n, 95n, 0n)).toBe(5n);
  expect(reservationRemaining(100n, 95n, 5n)).toBe(0n);
  expect(() => reservationRemaining(100n, 95n, 6n)).toThrow();
});
it.each([
  "unknown",
  "sent",
  "acknowledged",
  "picking",
  "partially_shipped",
  "shipped",
  "received",
  "held",
  "cancellation_requested",
])("expired %s reservation never authorizes release", (state) =>
  expect(canReleaseReservation(state)).toBe(false),
);
it.each(["draft", "reserved"])(
  "pre-dispatch %s reservation may request explicit release",
  (state) => expect(canReleaseReservation(state)).toBe(true),
);
it.each([
  [-1n, 0n, 0n, 0n, 0n],
  [0n, -1n, 0n, 0n, 0n],
  [0n, 0n, -1n, 0n, 0n],
  [0n, 0n, 0n, -1n, 0n],
  [0n, 0n, 0n, 0n, -1n],
])("negative physical or subset quantities are rejected %s", (...args) =>
  expect(() => stock(...args)).toThrow(),
);
it("scope grant requires the actual known warehouse and current policy version", () => {
  const grant = { permission: "inventory.read", scope: "a", policyVersion: 1 };
  expect(allowed([grant], "inventory.read", "a", ["a", "b"])).toBe(true);
  expect(allowed([grant], "inventory.read", "b", ["a", "b"])).toBe(false);
  expect(allowed([grant], "inventory.read", "a", [])).toBe(false);
  expect(
    allowed([{ ...grant, policyVersion: 2 }], "inventory.read", "a", ["a"]),
  ).toBe(false);
});
it("multiple SKU balanced groups and zero quantity entries are independent", () => {
  expect(
    balanced([
      { sku: "a", quantity: -2n },
      { sku: "a", quantity: 2n },
      { sku: "b", quantity: -7n },
      { sku: "b", quantity: 7n },
    ]),
  ).toBe(true);
  expect(
    balanced([
      { sku: "a", quantity: 0n },
      { sku: "a", quantity: 0n },
    ]),
  ).toBe(false);
});
import { inventoryRouteKeys } from "../../apps/api/src/inventory/route-contract";
import { inventoryCommands } from "../../apps/api/src/inventory/routes";
import { buildApi } from "../../apps/api/src/app";
import { logger } from "@wms/runtime";
it("inventory transport allowlist covers installed command adapters and rejects undeclared write opt-outs", async () => {
  for (const route of Object.values(inventoryCommands))
    expect(
      inventoryRouteKeys.has(
        (route.method ?? "POST") + " /api/v1/" + route.path,
      ),
    ).toBe(true);
  const app = buildApi(
    { check: async () => true, close: async () => {} },
    logger("api", () => {}),
  );
  try {
    app.post(
      "/api/v1/undeclared-stock-write",
      { config: { wmsInventory: true } },
      () => ({ unsafe: true }),
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/undeclared-stock-write",
        })
      ).statusCode,
    ).toBe(401);
  } finally {
    await app.close();
  }
});
import { InventoryService } from "../../apps/api/src/inventory/service";
it("synthetic evidence cannot become a public-schema production shortcut without explicit development opt-in", async () => {
  const auth = {} as ConstructorParameters<typeof InventoryService>[0];
  let calls = 0;
  const c = {
    query: async () => {
      calls++;
      return { rows: [{ name: "public" }] };
    },
  } as unknown as Parameters<InventoryService["synthetic"]>[0];
  const service = new InventoryService(auth, Buffer.alloc(32));
  expect(await service.synthetic(c, "external")).toBe(false);
  expect(calls).toBe(0);
  await expect(service.synthetic(c, "synthetic")).rejects.toMatchObject({
    status: 403,
  });
  const wrongDatabase = {
    query: async () => ({
      rows: [{ name: "wms_test_" + "a".repeat(32), database: "wms_dev" }],
    }),
  } as unknown as Parameters<InventoryService["synthetic"]>[0];
  await expect(
    service.synthetic(wrongDatabase, "synthetic"),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    await new InventoryService(auth, Buffer.alloc(32), true).synthetic(
      c,
      "synthetic",
    ),
  ).toBe(true);
});
it("exhausted database deadlock retries terminate after three attempts instead of looping", async () => {
  let attempts = 0;
  const auth = {
    rate: async () => {},
    tx: async () => {
      attempts++;
      throw Object.assign(new Error("synthetic deadlock"), { code: "40P01" });
    },
  } as unknown as ConstructorParameters<typeof InventoryService>[0];
  const service = new InventoryService(auth, Buffer.alloc(32));
  await expect(
    service.run(
      { ip: "synthetic", requestId: "bounded-retry" },
      true,
      async () => null,
    ),
  ).rejects.toMatchObject({ code: "40P01" });
  expect(attempts).toBe(3);
});
