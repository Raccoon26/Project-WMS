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
import { randomBytes } from "node:crypto";
import { migrationFolder } from "@wms/db";
import { scopedDatabase } from "../helpers";
import { AuthService } from "../../apps/api/src/auth/service";
import { newTotp } from "../../apps/api/src/auth/crypto";
import { seedCatalog } from "../../scripts/catalog-fixture";
it("DEV04 0000-0011 upgrades preserve real user/catalog rows under concurrent repeat migration and detect hash tampering", async () => {
  const f = await scopedDatabase(3000),
    folder = await mkdtemp(join(tmpdir(), "wms-document-upgrade-"));
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
    await writeFile(
      join(folder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 12) }),
    );
    await f.db.migrate(folder);
    const auth = new AuthService(
        f.db.pool,
        randomBytes(32),
        "http://127.0.0.1:5173",
      ),
      otp = newTotp("document-upgrade");
    const admin = await auth.bootstrap(
      "document-upgrade",
      randomBytes(24).toString("base64url"),
      "Synthetic Upgrade",
      otp.secret.base32,
      otp.generate({ timestamp: Date.now() - 30000 }),
    );
    await seedCatalog(f.db, f.schema, admin.id, 60);
    const old = (await f.db.pool.query("SELECT * FROM skus ORDER BY id")).rows,
      users = (await f.db.pool.query("SELECT * FROM users ORDER BY id")).rows;
    await Promise.all([f.db.migrate(), f.db.migrate()]);
    expect(await f.db.check()).toBe(true);
    expect(
      (await f.db.pool.query("SELECT * FROM skus ORDER BY id")).rows,
    ).toEqual(old);
    expect(
      (await f.db.pool.query("SELECT * FROM users ORDER BY id")).rows,
    ).toEqual(users);
    expect(
      (
        await f.db.pool.query(
          "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema=current_schema() AND table_name LIKE 'document%'",
        )
      ).rows[0].n,
    ).toBe(7);
    await writeFile(
      join(folder, "meta/_journal.json"),
      JSON.stringify(journal),
    );
    const tag = journal.entries[12].tag;
    await writeFile(
      join(folder, tag + ".sql"),
      (await readFile(join(folder, tag + ".sql"), "utf8")) +
        "\n-- synthetic history alteration\n",
    );
    await expect(f.db.migrate(folder)).rejects.toThrow(
      "MIGRATION_HISTORY_MISMATCH",
    );
    expect(await f.db.check()).toBe(true);
  } finally {
    await f.cleanup();
    await rm(folder, { recursive: true, force: true });
  }
});
it("failed new document migration rolls back schema and migration history without resetting DEV04 data", async () => {
  const f = await scopedDatabase(3000),
    folder = await mkdtemp(join(tmpdir(), "wms-document-migration-failure-"));
  try {
    await mkdir(join(folder, "meta"));
    const journal = JSON.parse(
      await readFile(join(migrationFolder, "meta/_journal.json"), "utf8"),
    );
    const old = { ...journal, entries: journal.entries.slice(0, 12) };
    for (const e of old.entries)
      await copyFile(
        join(migrationFolder, e.tag + ".sql"),
        join(folder, e.tag + ".sql"),
      );
    await writeFile(join(folder, "meta/_journal.json"), JSON.stringify(old));
    await f.db.migrate(folder);
    await f.db.pool.query(
      "INSERT INTO foundation_metadata(key,value) VALUES('document-preserved','synthetic')",
    );
    const pending = {
      idx: 12,
      version: "7",
      when: old.entries.at(-1).when + 1,
      tag: "0012_failure_probe",
      breakpoints: true,
    };
    await writeFile(
      join(folder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: [...old.entries, pending] }),
    );
    await writeFile(
      join(folder, pending.tag + ".sql"),
      "CREATE TABLE document_failure_probe(id uuid PRIMARY KEY);\n--> statement-breakpoint\nSELECT * FROM synthetic_missing_relation;",
    );
    await expect(f.db.migrate(folder)).rejects.toThrow();
    expect(
      (
        await f.db.pool.query(
          "SELECT to_regclass('document_failure_probe') AS value",
        )
      ).rows[0].value,
    ).toBe(null);
    expect(
      (
        await f.db.pool.query(
          "SELECT value FROM foundation_metadata WHERE key='document-preserved'",
        )
      ).rows[0].value,
    ).toBe("synthetic");
    expect(
      (await f.db.pool.query("SELECT count(*)::int n FROM wms_migrations"))
        .rows[0].n,
    ).toBe(12);
    await f.db.migrate();
    expect(await f.db.check()).toBe(true);
  } finally {
    await f.cleanup();
    await rm(folder, { recursive: true, force: true });
  }
});
