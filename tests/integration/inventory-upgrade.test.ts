import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { migrationFolder } from "@wms/db";
import { scopedDatabase } from "../helpers";
import { AuthService } from "../../apps/api/src/auth/service";
import { newTotp } from "../../apps/api/src/auth/crypto";
import { seedCatalog } from "../../scripts/catalog-fixture";
import { inventoryFixture } from "../inventory-helper";
it("DEV03 0000-0004 forward upgrade preserves actual catalog auth hashes grants sessions and worker readiness", async () => {
  const scope = await scopedDatabase(3000),
    folder = await mkdtemp(join(tmpdir(), "wms-inventory-upgrade-"));
  try {
    await mkdir(join(folder, "meta"));
    const journal = JSON.parse(
      await readFile(join(migrationFolder, "meta/_journal.json"), "utf8"),
    );
    const old = { ...journal, entries: journal.entries.slice(0, 5) };
    await writeFile(join(folder, "meta/_journal.json"), JSON.stringify(old));
    for (const entry of old.entries)
      await copyFile(
        join(migrationFolder, entry.tag + ".sql"),
        join(folder, entry.tag + ".sql"),
      );
    await scope.db.migrate(folder);
    const key = randomBytes(32),
      auth = new AuthService(scope.db.pool, key, "http://127.0.0.1:5173"),
      otp = newTotp("inventory-upgrade");
    const admin = await auth.bootstrap(
      "inventory-upgrade",
      randomBytes(24).toString("base64url"),
      "Synthetic Upgrade",
      otp.secret.base32,
      otp.generate({ timestamp: Date.now() - 30000 }),
    );
    await seedCatalog(scope.db, scope.schema, admin.id, 60);
    const users = (await scope.db.pool.query("SELECT * FROM users ORDER BY id"))
        .rows,
      skus = (await scope.db.pool.query("SELECT * FROM skus ORDER BY id")).rows,
      grants = (
        await scope.db.pool.query("SELECT * FROM user_roles ORDER BY id")
      ).rows;
    await Promise.all([scope.db.migrate(), scope.db.migrate()]);
    expect(await scope.db.check()).toBe(true);
    expect(
      (await scope.db.pool.query("SELECT * FROM users ORDER BY id")).rows,
    ).toEqual(users);
    expect(
      (await scope.db.pool.query("SELECT * FROM skus ORDER BY id")).rows,
    ).toEqual(skus);
    expect(
      (await scope.db.pool.query("SELECT * FROM user_roles ORDER BY id")).rows,
    ).toEqual(grants);
    expect(
      (await scope.db.pool.query("SELECT count(*) FROM inventory_entries"))
        .rows[0].count,
    ).toBe("0");
  } finally {
    await scope.cleanup();
    await rm(folder, { recursive: true, force: true });
  }
});
it("restricted database role can read historical entries but cannot UPDATE or DELETE ledger rows", async () => {
  const f = await inventoryFixture(),
    role = "wms_test_role_" + randomUUID().replaceAll("-", "");
  let created = false;
  try {
    await f.opening();
    await f.db.pool.query("CREATE ROLE " + role + " NOLOGIN");
    created = true;
    await f.db.pool.query("GRANT USAGE ON SCHEMA " + f.schema + " TO " + role);
    await f.db.pool.query("GRANT SELECT ON inventory_entries TO " + role);
    const c = await f.db.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE " + role);
      expect(
        (await c.query("SELECT count(*) FROM inventory_entries")).rows[0].count,
      ).toBe("2");
      await expect(
        c.query("UPDATE inventory_entries SET quantity=1"),
      ).rejects.toMatchObject({ code: "42501" });
      await c.query("ROLLBACK");
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE " + role);
      await expect(
        c.query("DELETE FROM inventory_entries"),
      ).rejects.toMatchObject({ code: "42501" });
      await c.query("ROLLBACK");
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  } finally {
    if (created) {
      await f.db.pool.query("REVOKE ALL ON inventory_entries FROM " + role);
      await f.db.pool.query(
        "REVOKE ALL ON SCHEMA " + f.schema + " FROM " + role,
      );
      await f.db.pool.query("DROP ROLE " + role);
    }
    await f.cleanup();
  }
});
