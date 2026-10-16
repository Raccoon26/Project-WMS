import { it, expect } from "vitest";
import {
  readFile,
  writeFile,
  mkdtemp,
  copyFile,
  mkdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { migrationFolder } from "@wms/db";
import { scopedDatabase } from "../helpers";
import { AuthService } from "../../apps/api/src/auth/service";
import { newTotp } from "../../apps/api/src/auth/crypto";
import { catalogFixture } from "../catalog-helper";
it("DEV02 upgrade preserves actual password MFA session global grants and installs new permissions without bootstrap", async () => {
  const scope = await scopedDatabase(3000),
    folder = await mkdtemp(join(tmpdir(), "wms-catalog-upgrade-"));
  try {
    await mkdir(join(folder, "meta"));
    const journal = JSON.parse(
      await readFile(join(migrationFolder, "meta/_journal.json"), "utf8"),
    );
    const old = { ...journal, entries: journal.entries.slice(0, 2) };
    await writeFile(join(folder, "meta/_journal.json"), JSON.stringify(old));
    for (const entry of old.entries)
      await copyFile(
        join(migrationFolder, entry.tag + ".sql"),
        join(folder, entry.tag + ".sql"),
      );
    await scope.db.migrate(folder);
    const key = randomBytes(32),
      password = randomBytes(24).toString("base64url"),
      service = new AuthService(scope.db.pool, key, "http://127.0.0.1:5173"),
      otp = newTotp("upgrade");
    const admin = await service.bootstrap(
      "upgrade-admin",
      password,
      "Synthetic Upgrade",
      otp.secret.base32,
      otp.generate({ timestamp: Date.now() - 30000 }),
    );
    // Precisely reproduce DEV02 role permissions. New permissions must come from migration, not seedRoles.
    await scope.db.pool.query(
      "DELETE FROM role_permissions WHERE permission_code LIKE 'warehouses.%' OR permission_code LIKE 'locations.%' OR permission_code LIKE 'mappings.%'",
    );
    await scope.db.pool.query(
      "DELETE FROM permissions WHERE code LIKE 'warehouses.%' OR code LIKE 'locations.%' OR code LIKE 'mappings.%'",
    );
    const before = (await scope.db.pool.query("SELECT * FROM user_roles")).rows;
    const anon = await service.csrfSession({
      ip: "synthetic",
      requestId: "upgrade",
    });
    const ctx = {
      token: anon.issued!.token,
      csrf: anon.csrf,
      origin: service.origin,
      ip: "synthetic",
      requestId: "upgrade",
    };
    const limited = await service.login(ctx, "upgrade-admin", password);
    const verified = await service.verifyMfa(
      { ...ctx, token: limited.token, csrf: limited.csrf },
      otp.generate(),
    );
    await scope.db.pool.query(
      "INSERT INTO foundation_metadata(key,value) VALUES('dev01-upgrade','preserved')",
    );
    await Promise.all([scope.db.migrate(), scope.db.migrate()]);
    expect(await scope.db.migrationStatus()).toBe(true);
    const identity = await service.me({
      ...ctx,
      token: verified.token,
      csrf: verified.csrf,
    });
    expect(identity.permissions).toContain("warehouses.manage");
    expect(identity.permissions).toContain("mappings.manage");
    expect(identity.id).toBe(admin.id);
    const after = (await scope.db.pool.query("SELECT * FROM user_roles")).rows;
    expect(
      after.map(({ warehouse_id, ...r }) => {
        expect(warehouse_id).toBeNull();
        return r;
      }),
    ).toEqual(before);
    expect(
      (
        await scope.db.pool.query(
          "SELECT value FROM foundation_metadata WHERE key='dev01-upgrade'",
        )
      ).rows[0].value,
    ).toBe("preserved");
  } finally {
    await scope.cleanup();
    await rm(folder, { recursive: true, force: true });
  }
});
it("catalog upgrade SQL failure rolls back new tables while preserving previous authentication data and history", async () => {
  const f = await catalogFixture(),
    folder = await mkdtemp(join(tmpdir(), "wms-catalog-failed-"));
  try {
    await mkdir(join(folder, "meta"));
    const journal = JSON.parse(
      await readFile(join(migrationFolder, "meta/_journal.json"), "utf8"),
    );
    for (const e of journal.entries)
      await copyFile(
        join(migrationFolder, e.tag + ".sql"),
        join(folder, e.tag + ".sql"),
      );
    journal.entries.push({
      idx: journal.entries.length,
      version: "7",
      when: journal.entries.at(-1).when + 1,
      tag: "9999_synthetic_failure",
      breakpoints: true,
    });
    await writeFile(
      join(folder, "meta/_journal.json"),
      JSON.stringify(journal),
    );
    await writeFile(
      join(folder, "9999_synthetic_failure.sql"),
      "CREATE TABLE catalog_must_rollback(id integer);\n--> statement-breakpoint\nSELECT * FROM synthetic_missing_relation;",
    );
    const before = (
      await f.db.pool.query("SELECT count(*) FROM wms_migrations")
    ).rows[0].count;
    await expect(f.db.migrate(folder)).rejects.toThrow();
    expect(
      (
        await f.db.pool.query(
          "SELECT to_regclass('catalog_must_rollback') AS value",
        )
      ).rows[0].value,
    ).toBeNull();
    expect(
      (await f.db.pool.query("SELECT count(*) FROM wms_migrations")).rows[0]
        .count,
    ).toBe(before);
    expect((await f.request("auth/me")).statusCode).toBe(200);
    expect((await f.request("products/" + f.product.id)).statusCode).toBe(200);
  } finally {
    await f.cleanup();
    await rm(folder, { recursive: true, force: true });
  }
});
it("catalog revision snapshots retain prior mapping evidence, are append-only and paginate", async () => {
  const f = await catalogFixture();
  try {
    const sku = await f.create("skus", {
        code: "REVISION-SKU",
        product_id: f.product.id,
      }),
      account = await f.create("integration-accounts", {
        provider: "amazon",
        account_ref: "history",
        name: "Synthetic",
      }),
      mapping = await f.create("skus/" + sku.id + "/mappings", {
        account_id: account.id,
        provider: "amazon",
        marketplace: "JP",
        external_code: "Original",
      });
    await f.request(
      "mappings/" + mapping.id,
      { version: 1, trust: "local_reviewed" },
      "PATCH",
    );
    await f.request(
      "mappings/" + mapping.id,
      { version: 2, external_code: "New-Code" },
      "PATCH",
    );
    const history = await f.request(
      "mappings/" + mapping.id + "/history?limit=1",
    );
    expect(history.statusCode).toBe(200);
    expect(history.json().items[0].snapshot.trust).toBe("local_reviewed");
    expect(history.json().items[0].snapshot.status).toBe("inactive");
    expect(history.json().items[0].snapshot.evidence_version).toBe(2);
    expect(history.json().nextCursor).toBe("3");
    expect(
      (await f.request("mappings/" + mapping.id + "/history?before=3"))
        .json()
        .items.map((r: { version: number }) => r.version),
    ).toEqual([2, 1]);
    await expect(
      f.db.pool.query("UPDATE catalog_revisions SET version=100"),
    ).rejects.toThrow();
    await expect(
      f.db.pool.query("DELETE FROM catalog_revisions"),
    ).rejects.toThrow();
  } finally {
    await f.cleanup();
  }
});
it("direct concurrent database location updates serialize on warehouse and cannot introduce a cycle", async () => {
  const f = await catalogFixture();
  try {
    const a = await f.create("warehouses/" + f.warehouse.id + "/locations", {
        code: "DIRECT-A",
        name: "A",
      }),
      b = await f.create("warehouses/" + f.warehouse.id + "/locations", {
        code: "DIRECT-B",
        name: "B",
      });
    const r = await Promise.allSettled([
      f.db.pool.query("UPDATE locations SET parent_id=$1 WHERE id=$2", [
        b.id,
        a.id,
      ]),
      f.db.pool.query("UPDATE locations SET parent_id=$1 WHERE id=$2", [
        a.id,
        b.id,
      ]),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});
it("non-increasing newly generated migration timestamps are rejected before changing schema or history", async () => {
  const f = await catalogFixture(),
    folder = await mkdtemp(join(tmpdir(), "wms-catalog-order-"));
  try {
    await mkdir(join(folder, "meta"));
    const journal = JSON.parse(
      await readFile(join(migrationFolder, "meta/_journal.json"), "utf8"),
    );
    for (const e of journal.entries)
      await copyFile(
        join(migrationFolder, e.tag + ".sql"),
        join(folder, e.tag + ".sql"),
      );
    journal.entries[2].when = journal.entries[1].when - 1;
    await writeFile(
      join(folder, "meta/_journal.json"),
      JSON.stringify(journal),
    );
    await expect(f.db.migrate(folder)).rejects.toThrow(
      "MIGRATION_ORDER_INVALID",
    );
    expect(await f.db.migrationStatus()).toBe(true);
    expect((await f.request("auth/me")).statusCode).toBe(200);
  } finally {
    await f.cleanup();
    await rm(folder, { recursive: true, force: true });
  }
});
it("location hierarchy depth sixteen is enforced by DB, including descendant depth after reparenting", async () => {
  const f = await catalogFixture();
  try {
    let parent: string | null = null;
    for (let depth = 1; depth <= 16; depth++) {
      const row = await f.create(
        "warehouses/" + f.warehouse.id + "/locations",
        { code: "DEPTH-" + depth, name: "Level " + depth, parent_id: parent },
      );
      parent = row.id;
    }
    expect(
      (
        await f.request(
          "warehouses/" + f.warehouse.id + "/locations",
          { code: "DEPTH-17", name: "Too deep", parent_id: parent },
          "POST",
          { "idempotency-key": crypto.randomUUID() },
        )
      ).statusCode,
    ).toBe(422);
    const root = (
      await f.db.pool.query("SELECT id FROM locations WHERE code='DEPTH-1'")
    ).rows[0].id;
    const extra = await f.create(
      "warehouses/" + f.warehouse.id + "/locations",
      { code: "EXTRA-ROOT", name: "Extra" },
    );
    expect(
      (
        await f.request(
          "locations/" + root,
          { version: 1, parent_id: extra.id },
          "PATCH",
        )
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await f.db.pool.query("SELECT parent_id FROM locations WHERE id=$1", [
          root,
        ])
      ).rows[0].parent_id,
    ).toBeNull();
  } finally {
    await f.cleanup();
  }
});
it("mapping replacement collision rolls back closing the old mapping and preserves review evidence and revisions", async () => {
  const f = await catalogFixture();
  try {
    const first = await f.create("skus", {
        code: "COLLISION-FIRST",
        product_id: f.product.id,
      }),
      second = await f.create("skus", {
        code: "COLLISION-SECOND",
        product_id: f.product.id,
      }),
      account = await f.create("integration-accounts", {
        provider: "amazon",
        account_ref: "replacement-collision",
        name: "Synthetic",
      });
    const body = {
      account_id: account.id,
      provider: "amazon",
      marketplace: "JP",
    };
    const original = await f.create("skus/" + first.id + "/mappings", {
      ...body,
      external_code: "Original",
      trust: "local_reviewed",
    });
    await f.create("skus/" + second.id + "/mappings", {
      ...body,
      external_code: "Taken",
    });
    expect(
      (
        await f.request(
          "mappings/" + original.id,
          { version: 1, external_code: "Taken" },
          "PATCH",
        )
      ).statusCode,
    ).toBe(409);
    const stored = (
      await f.db.pool.query(
        "SELECT status,version,trust,external_code FROM sku_mappings WHERE id=$1",
        [original.id],
      )
    ).rows[0];
    expect(stored).toEqual({
      status: "active",
      version: 1,
      trust: "local_reviewed",
      external_code: "Original",
    });
    expect(
      (await f.request("mappings/" + original.id + "/history")).json().items,
    ).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});
