import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrationFolder } from "@wms/db";
import { it, expect } from "vitest";
import { scopedDatabase } from "../helpers";
import { foundationMetadata } from "@wms/db";
import { eq } from "drizzle-orm";
import { buildApi } from "../../apps/api/src/app";
import { logger } from "@wms/runtime";
it("real PostgreSQL migrations are atomic, repeatable and schema checked", async () => {
  const scope = await scopedDatabase();
  const { db } = scope;
  try {
    expect(await db.check()).toBe(false);
    await Promise.all([db.migrate(), db.migrate()]);
    expect(await db.migrationStatus()).toBe(true);
    expect(await db.check()).toBe(true);
    const history = await db.pool.query("SELECT * FROM wms_migrations");
    expect(history.rowCount).toBe(
      readMigrationFiles({ migrationsFolder: migrationFolder }).length,
    );
    const tables = await db.pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=$1",
      [scope.schema],
    );
    expect(tables.rows.map((r) => r.table_name)).toContain(
      "foundation_metadata",
    );
    await db.orm
      .insert(foundationMetadata)
      .values({ key: "synthetic", value: "preserved" });
    await db.migrate();
    const rows = await db.orm
      .select()
      .from(foundationMetadata)
      .where(eq(foundationMetadata.key, "synthetic"));
    expect(rows[0]?.value).toBe("preserved");
    expect(
      (await db.pool.query("SHOW server_version")).rows[0].server_version,
    ).toMatch(/^17\./);
  } finally {
    await scope.cleanup();
  }
});
it("independent test schemas cannot read one another", async () => {
  const a = await scopedDatabase();
  const b = await scopedDatabase();
  try {
    await a.db.migrate();
    await b.db.migrate();
    await a.db.orm
      .insert(foundationMetadata)
      .values({ key: "isolated", value: "only-A" });
    expect(
      await b.db.orm
        .select()
        .from(foundationMetadata)
        .where(eq(foundationMetadata.key, "isolated")),
    ).toHaveLength(0);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});
it("API readiness reflects actual DB migrations and headers prevent caching", async () => {
  const scope = await scopedDatabase();
  const app = buildApi(
    scope.db,
    logger("api", () => {}),
  );
  try {
    expect((await app.inject("/api/v1/health/ready")).statusCode).toBe(503);
    await scope.db.migrate();
    const r = await app.inject("/api/v1/health/ready");
    expect(r.statusCode).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.json().checkedAt).toMatch(/Z$/);
    expect((await app.inject("/api/v1/version")).json()).toEqual({
      name: "Project-WMS",
      version: "0.1.0",
      apiVersion: "v1",
    });
  } finally {
    await app.close();
    await scope.cleanup();
  }
});
it("closed pool rejects queries and cannot report readiness", async () => {
  const scope = await scopedDatabase();
  await scope.db.migrate();
  await scope.db.close();
  await expect(scope.db.pool.query("SELECT 1")).rejects.toThrow();
  expect(await scope.db.check()).toBe(false);
  await scope.cleanup();
});
