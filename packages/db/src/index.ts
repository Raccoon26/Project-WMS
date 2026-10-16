import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { fileURLToPath } from "node:url";
import type { DatabaseProbe } from "@wms/contracts";
export { foundationMetadata } from "./schema.js";
export const migrationFolder = fileURLToPath(
  new URL("../migrations", import.meta.url),
);
// Built code is in dist/, source code is in src/: both resolve the same sibling migrations.
export function schemaName(value: string): string {
  if (!/^(public|wms_test_[a-f0-9]{32})$/.test(value))
    throw new Error("UNSAFE_SCHEMA");
  return value;
}
function localDatabaseUrl(
  value: string | undefined,
  expected: "wms_test" | "wms_dev",
): string {
  let u: URL;
  try {
    u = new URL(value ?? "");
  } catch {
    throw new Error("DATABASE_URL_REQUIRED");
  }
  const hosts =
    expected === "wms_test"
      ? ["127.0.0.1", "localhost", "db-test"]
      : ["127.0.0.1", "localhost"];
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    !hosts.includes(u.hostname) ||
    u.pathname !== "/" + expected ||
    decodeURIComponent(u.username) !== expected ||
    u.search
  )
    throw new Error("UNSAFE_DATABASE_TARGET");
  return u.toString();
}
export function testDatabaseUrl(value: string | undefined): string {
  return localDatabaseUrl(value, "wms_test");
}
export function developmentDatabaseUrl(value: string | undefined): string {
  return localDatabaseUrl(value, "wms_dev");
}
export function createDatabase(
  url: string,
  options: { schema?: string; timeoutMs?: number; max?: number } = {},
) {
  const schema = schemaName(options.schema ?? "public");
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 5,
    connectionTimeoutMillis: options.timeoutMs ?? 1000,
    idleTimeoutMillis: 5000,
    statement_timeout: options.timeoutMs ?? 1000,
    query_timeout: (options.timeoutMs ?? 1000) + 100,
    options: `-c search_path=${schema},pg_catalog`,
  });
  // Idle socket errors must not terminate the process or print connection details.
  pool.on("error", () => {});
  const orm = drizzle(pool);
  const migrations = () =>
    readMigrationFiles({ migrationsFolder: migrationFolder });
  async function migrationStatus(): Promise<boolean> {
    const expected = migrations();
    const r = await pool.query<{ id: string; hash: string }>(
      "SELECT id,hash FROM wms_migrations ORDER BY id",
    );
    return (
      r.rows.length === expected.length &&
      expected.every(
        (m, i) =>
          r.rows[i]?.id === String(m.folderMillis) &&
          r.rows[i]?.hash === m.hash,
      )
    );
  }
  async function migrate(folder = migrationFolder): Promise<void> {
    const files = readMigrationFiles({ migrationsFolder: folder });
    if (!files.length) throw new Error("NO_MIGRATIONS");
    if (
      files.some(
        (m, i) => i > 0 && m.folderMillis <= files[i - 1]!.folderMillis,
      )
    )
      throw new Error("MIGRATION_ORDER_INVALID");
    await orm.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(74001)`);
      await tx.execute(
        sql`CREATE TABLE IF NOT EXISTS wms_migrations (id bigint PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`,
      );
      const done = await tx.execute<{ id: string; hash: string }>(
        sql`SELECT id,hash FROM wms_migrations ORDER BY id`,
      );
      if (
        done.rows.length > files.length ||
        done.rows.some(
          (r, i) =>
            String(files[i]?.folderMillis) !== r.id ||
            files[i]?.hash !== r.hash,
        )
      )
        throw new Error("MIGRATION_HISTORY_MISMATCH");
      for (const m of files.slice(done.rows.length)) {
        for (const statement of m.sql)
          if (statement.trim()) await tx.execute(sql.raw(statement));
        await tx.execute(
          sql`INSERT INTO wms_migrations (id,hash) VALUES (${m.folderMillis},${m.hash})`,
        );
      }
    });
  }
  async function check(): Promise<boolean> {
    try {
      await pool.query("SELECT key FROM foundation_metadata LIMIT 1");
      return await migrationStatus();
    } catch {
      return false;
    }
  }
  let closed: Promise<void> | undefined;
  const close = () => (closed ??= pool.end());
  return {
    pool,
    orm,
    migrate,
    migrationStatus,
    check,
    close,
  } satisfies DatabaseProbe & Record<string, unknown>;
}
export type Database = ReturnType<typeof createDatabase>;
export * from "./auth-schema.js";
export * from "./catalog-schema.js";
