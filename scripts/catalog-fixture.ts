// Test-only importer: original future-ledger quantities are deliberately ignored.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Database } from "@wms/db";
import { testDatabaseUrl, schemaName } from "@wms/db";
export interface SyntheticCatalog {
  synthetic: true;
  skus: {
    id: string;
    sku: string;
    status: string;
    mappings: Record<string, string>;
  }[];
}
export function syntheticCatalog(count = 60): SyntheticCatalog {
  return count === 60
    ? JSON.parse(readFileSync("docs/fixtures/sku-scenarios.json", "utf8"))
    : JSON.parse(
        execFileSync(
          "python3",
          ["scripts/generate_sku_fixture.py", "--count", String(count)],
          { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
        ),
      );
}
export async function seedCatalog(
  db: Database,
  schema: string,
  actor: string,
  count = 60,
) {
  testDatabaseUrl(process.env.TEST_DATABASE_URL);
  if (!schemaName(schema).startsWith("wms_test_"))
    throw new Error("TEST_SCHEMA_REQUIRED");
  const source = syntheticCatalog(count);
  if (!source.synthetic || source.skus.length !== count)
    throw new Error("SYNTHETIC_DATA_REQUIRED");
  const c = await db.pool.connect();
  try {
    await c.query("BEGIN");
    if (
      (await c.query("SELECT current_schema() AS schema")).rows[0].schema !==
      schema
    )
      throw new Error("TEST_SCHEMA_MISMATCH");
    for (const [i, type] of [
      "external_email",
      "fba",
      "rsl",
      "internal",
    ].entries())
      await c.query(
        "INSERT INTO warehouses(id,code,name,type,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5)",
        [randomUUID(), "FIXTURE-" + i, "Synthetic Warehouse " + i, type, actor],
      );
    const accounts: Record<string, string> = {};
    for (const provider of ["amazon", "rakuten"]) {
      const id = randomUUID();
      accounts[provider] = id;
      await c.query(
        "INSERT INTO integration_accounts(id,provider,account_ref,name,created_by,updated_by) VALUES($1,$2,'synthetic-fixture',$2,$3,$3)",
        [id, provider, actor],
      );
    }
    for (const [i, row] of source.skus.entries()) {
      const product = randomUUID();
      await c.query(
        "INSERT INTO products(id,name_ja,status,created_by,updated_by) VALUES($1,$2,$3,$4,$4)",
        [
          product,
          "合成商品 " + String(i + 1).padStart(4, "0"),
          row.status,
          actor,
        ],
      );
      await c.query(
        "INSERT INTO skus(id,product_id,code,status,barcode,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6)",
        [
          row.id,
          product,
          row.sku,
          row.status,
          String(1000000000000 + i),
          actor,
        ],
      );
      for (const [provider, external] of Object.entries(row.mappings))
        await c.query(
          "INSERT INTO sku_mappings(id,sku_id,account_id,provider,marketplace,external_code,created_by,updated_by) VALUES($1,$2,$3,$4,'JP',$5,$6,$6)",
          [randomUUID(), row.id, accounts[provider], provider, external, actor],
        );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return source;
}
