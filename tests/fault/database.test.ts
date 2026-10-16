import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scopedDatabase } from "../helpers";
import {
  createDatabase,
  migrationFolder,
  testDatabaseUrl,
  schemaName,
  developmentDatabaseUrl,
} from "@wms/db";
import { buildApi } from "../../apps/api/src/app";
import { logger } from "@wms/runtime";
it("wrong DB settings fail safely without marking readiness true", async () => {
  const db = createDatabase(
    "postgresql://wms_test:synthetic@127.0.0.1:1/wms_test",
    { timeoutMs: 100 },
  );
  try {
    expect(await db.check()).toBe(false);
    await expect(db.migrate()).rejects.toThrow();
  } finally {
    await db.close();
  }
});
it("destructive test tooling rejects production/remote targets", () => {
  for (const url of [
    undefined,
    "postgresql://u@db.example.invalid/wms_test",
    "postgresql://wms_test@127.0.0.1/wms_dev",
    "postgresql://admin@127.0.0.1/wms_test",
  ])
    expect(() => testDatabaseUrl(url)).toThrow();
  expect(() => schemaName("public; DROP TABLE x")).toThrow();
  expect(() =>
    developmentDatabaseUrl(
      "postgresql://wms_dev:synthetic@db.example.invalid/wms_dev",
    ),
  ).toThrow();
  expect(() =>
    developmentDatabaseUrl(
      "postgresql://wms_dev:synthetic@127.0.0.1/production",
    ),
  ).toThrow();
});
it("query delay times out, readiness degrades, and recovers after lock release", async () => {
  const scope = await scopedDatabase(200);
  await scope.db.migrate();
  const app = buildApi(
    scope.db,
    logger("api", () => {}),
  );
  const blocker = await scope.db.pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query(
      "LOCK TABLE foundation_metadata IN ACCESS EXCLUSIVE MODE",
    );
    const started = Date.now();
    expect((await app.inject("/api/v1/health/ready")).statusCode).toBe(503);
    expect(Date.now() - started).toBeLessThan(2000);
    expect((await app.inject("/api/v1/health/live")).statusCode).toBe(200);
    await blocker.query("ROLLBACK");
    expect((await app.inject("/api/v1/health/ready")).statusCode).toBe(200);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await app.close();
    await scope.cleanup();
  }
});
it("failed migration rolls back both schema and history", async () => {
  const scope = await scopedDatabase();
  const folder = await mkdtemp(join(tmpdir(), "wms-migration-"));
  try {
    await scope.db.migrate();
    await cp(migrationFolder, folder, { recursive: true });
    await mkdir(join(folder, "meta"), { recursive: true });
    const journal = JSON.parse(
      await readFile(join(folder, "meta/_journal.json"), "utf8"),
    );
    const last = journal.entries.at(-1);
    journal.entries.push({
      ...last,
      idx: last.idx + 1,
      when: last.when + 1,
      tag: "0001_failure",
    });
    await writeFile(
      join(folder, "meta/_journal.json"),
      JSON.stringify(journal),
    );
    await writeFile(
      join(folder, "0001_failure.sql"),
      "CREATE TABLE should_rollback(id integer);\n--> statement-breakpoint\nSELECT 1/0;",
    );
    await expect(scope.db.migrate(folder)).rejects.toThrow();
    expect(
      (
        await scope.db.pool.query(
          "SELECT to_regclass('should_rollback') AS relation",
        )
      ).rows[0].relation,
    ).toBeNull();
    expect(await scope.db.migrationStatus()).toBe(true);
  } finally {
    await scope.cleanup();
    await rm(folder, { recursive: true, force: true });
  }
});
it("edited migration history is rejected rather than silently replayed", async () => {
  const scope = await scopedDatabase();
  try {
    await scope.db.migrate();
    await scope.db.pool.query(
      "UPDATE wms_migrations SET hash='synthetic-tamper'",
    );
    expect(await scope.db.check()).toBe(false);
    await expect(scope.db.migrate()).rejects.toThrow(
      "MIGRATION_HISTORY_MISMATCH",
    );
  } finally {
    await scope.cleanup();
  }
});
it("real PostgreSQL rejects incorrect authentication without readiness success", async () => {
  const { testUrl } = await import("../helpers");
  const url = new URL(testUrl());
  url.password = "incorrect_synthetic";
  const db = createDatabase(url.toString(), { timeoutMs: 300 });
  try {
    expect(await db.check()).toBe(false);
    await expect(db.migrate()).rejects.toThrow();
  } finally {
    await db.close();
  }
});
