import { describe, it, expect } from "vitest";
import { config, ConfigError, requestId, logger } from "@wms/runtime";
import { apiError, pageSize, utcNow } from "@wms/contracts";
import { integerString, parseInteger } from "@wms/domain";
import { externalCapabilities } from "../../packages/integrations/src/index";
import {
  localeOf,
  translate,
  formatDate,
  formatNumber,
  formatCurrencyMinor,
} from "../../apps/web/src/i18n";
import { routes, routeFor } from "../../apps/web/src/routes";
import { serviceWorkerSource } from "../../apps/web/pwa-build";
const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://wms_test:wms_test_only@127.0.0.1:5433/wms_test",
};
describe("configuration", () => {
  it("validates defaults independently for api/worker", () => {
    expect(config(base, "api").port).toBe(3001);
    expect(config(base, "worker").port).toBe(3002);
    expect(config(base, "api").poolMax).toBe(5);
  });
  it.each(["NODE_ENV", "DATABASE_URL"])("requires %s", (key) => {
    const e = { ...base, [key]: undefined };
    expect(() => config(e, "api")).toThrow(ConfigError);
  });
  it.each(["0", "65536", "1.2", "x", "-1"])("rejects port %s", (API_PORT) =>
    expect(() => config({ ...base, API_PORT }, "api")).toThrow("API_PORT"),
  );
  it.each(["staging", "production", ""])(
    "rejects unsafe environment %s",
    (NODE_ENV) =>
      expect(() => config({ ...base, NODE_ENV }, "api")).toThrow(ConfigError),
  );
  it.each([
    "https://example.invalid",
    "postgresql:///db",
    "postgresql://u@127.0.0.1/db?sslmode=disable",
  ])("rejects DB URL without printing values", (DATABASE_URL) => {
    try {
      config({ ...base, DATABASE_URL }, "api");
      throw new Error("not rejected");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect(String(e)).not.toContain(DATABASE_URL);
    }
  });
  it("rejects public bind and invalid pool timeout", () => {
    expect(() => config({ ...base, HOST: "0.0.0.0" }, "api")).toThrow("HOST");
    expect(() => config({ ...base, DB_POOL_MAX: "100" }, "api")).toThrow(
      "DB_POOL_MAX",
    );
    expect(() => config({ ...base, DB_TIMEOUT_MS: "1" }, "api")).toThrow(
      "DB_TIMEOUT_MS",
    );
  });
});
describe("contracts", () => {
  it("has a stable error shape", () =>
    expect(apiError("SERVICE_UNAVAILABLE", "request-123")).toEqual({
      code: "SERVICE_UNAVAILABLE",
      messageKey: "errors.serviceUnavailable",
      requestId: "request-123",
      retryable: true,
      details: null,
    }));
  it("passes safe request IDs and replaces missing/invalid input", () => {
    expect(requestId("request-123")).toBe("request-123");
    for (const input of [undefined, "bad", "bad id\n", Array(2).fill("value")])
      expect(requestId(input)).toMatch(/^[a-f0-9-]{36}$/);
  });
  it("uses UTC and exact big integers", () => {
    expect(utcNow()).toMatch(/Z$/);
    const big = 90071992547409931234n;
    expect(parseInteger(integerString(big))).toBe(big);
    expect(JSON.stringify({ quantity: integerString(big) })).toContain(
      '"90071992547409931234"',
    );
    expect(() => parseInteger("1.1")).toThrow();
    expect(() => parseInteger("-0")).toThrow();
  });
  it("caps page size, never total SKU count", () => {
    expect(pageSize()).toBe(25);
    expect(pageSize(100)).toBe(100);
    expect(() => pageSize(101)).toThrow();
    expect(() => pageSize(1.5)).toThrow();
  });
  it("external effects including AI are disabled", () =>
    expect(Object.values(externalCapabilities).every((v) => v === false)).toBe(
      true,
    ));
});
describe("web contracts", () => {
  it("defaults safely to Japanese with missing translation fallback", () => {
    expect(localeOf(undefined)).toBe("ja");
    expect(localeOf("bogus")).toBe("ja");
    expect(localeOf("ko")).toBe("ko");
    expect(translate("en", "foundation")).toBe(translate("ja", "foundation"));
  });
  it("has 15 unique routable management screens", () => {
    expect(routes).toHaveLength(15);
    expect(new Set(routes.map((r) => r[0])).size).toBe(15);
    expect(routeFor("/nope")).toBeUndefined();
    expect(routeFor("/inventory")?.[1]).toBe("inventory");
  });
  it("formats in Japan time and preserves large integer display", () => {
    expect(formatDate("2026-10-16T00:00:00Z", "en")).toContain("09:00:00");
    expect(formatDate("invalid", "ja")).toBe("—");
    expect(formatNumber(90071992547409931234n, "en")).toBe(
      "90,071,992,547,409,931,234",
    );
    expect(formatCurrencyMinor(100n, "JPY", "ja")).toContain("100");
  });
  it("service worker contains only explicit static caching and no write queue", () => {
    const source = serviceWorkerSource(
      ["/index.html", "/assets/test.js"],
      "test",
    );
    expect(source).toContain("r.method!=='GET'");
    expect(source).toContain("u.pathname.startsWith('/api/')");
    expect(source).not.toContain("addEventListener('sync'");
    expect(source).not.toContain("cache.put");
  });
});
describe("logging", () => {
  it("does not serialize errors, configuration, headers or passwords", () => {
    const lines: string[] = [];
    const log = logger("api", (s) => lines.push(s));
    const unsafe = {
      code: "DB_UNAVAILABLE",
      password: "synthetic-" + "sensitive-value",
      databaseUrl: base.DATABASE_URL,
      err: new Error(base.DATABASE_URL),
      authorization: "Bearer synthetic",
      cookie: "synthetic",
    };
    log.error("query_failed", unsafe);
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      service: "api",
      level: "error",
      code: "DB_UNAVAILABLE",
    });
    expect(lines[0]).not.toContain("sensitive-value");
    expect(lines[0]).not.toContain(base.DATABASE_URL);
    expect(entry).not.toHaveProperty("err");
  });
});
it("development configuration generator preserves existing user files", async () => {
  const { mkdtemp, readFile, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const directory = await mkdtemp(join(tmpdir(), "wms-setup-"));
  try {
    await writeFile(
      join(directory, ".env.example"),
      await readFile(".env.example", "utf8"),
    );
    const run = () =>
      spawnSync(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          resolve("scripts/dev-setup.ts"),
        ],
        { cwd: directory, encoding: "utf8" },
      );
    expect(run().status).toBe(0);
    const first = await readFile(join(directory, ".env"), "utf8");
    expect(first).not.toContain("replace-with-local-value");
    expect(run().status).not.toBe(0);
    expect(await readFile(join(directory, ".env"), "utf8")).toBe(first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
