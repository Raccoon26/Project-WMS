// Synthetic E2E fixtures only. No production URL, public schema or live user reuse.
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { createDatabase, testDatabaseUrl, schemaName } from "@wms/db";
import { AuthService } from "../apps/api/src/auth/service.js";
import { passwordHash, newTotp, encrypt } from "../apps/api/src/auth/crypto.js";
const url = testDatabaseUrl(process.env.TEST_DATABASE_URL);
const file = ".runtime/auth-fixture.json";
if (process.env.NODE_ENV !== "test")
  throw new Error("TEST_ENVIRONMENT_REQUIRED");
const command = process.argv[2];
if (command === "--prepare") {
  const schema = "wms_test_" + randomUUID().replaceAll("-", "");
  const admin = createDatabase(url);
  await admin.pool.query(`CREATE SCHEMA ${schema}`);
  await admin.close();
  const db = createDatabase(url, { schema, timeoutMs: 3000 });
  try {
    await db.migrate();
    const key = randomBytes(32).toString("base64"),
      password = randomBytes(24).toString("base64url");
    const service = new AuthService(
      db.pool,
      Buffer.from(key, "base64"),
      "http://127.0.0.1:4173",
    );
    await service.tx((c) => service.seedRoles(c));
    const hash = await passwordHash(password);
    mkdirSync(".runtime", { recursive: true });
    writeFileSync(file, JSON.stringify({ schema, key, password, hash }), {
      mode: 0o600,
    });
  } finally {
    await db.close();
  }
} else {
  const state = JSON.parse(readFileSync(file, "utf8")) as {
    schema: string;
    key: string;
    password: string;
    hash: string;
  };
  const schema = schemaName(state.schema);
  if (!schema.startsWith("wms_test_")) throw new Error("TEST_SCHEMA_REQUIRED");
  const db = createDatabase(url, { schema, timeoutMs: 3000 });
  try {
    if (command === "--cleanup") {
      await db.pool.query(`DROP SCHEMA ${schema} CASCADE`);
      unlinkSync(file);
    } else if (command === "--account") {
      const role = process.argv[3] ?? "Administrator";
      if (
        ![
          "Administrator",
          "Viewer",
          "Operator",
          "Auditor",
          "Unenrolled",
        ].includes(role)
      )
        throw new Error("INVALID_TEST_ROLE");
      const id = randomUUID(),
        login = "e2e-" + id,
        otp = newTotp(login),
        enabled = role !== "Unenrolled";
      const service = new AuthService(
        db.pool,
        Buffer.from(state.key, "base64"),
        "http://127.0.0.1:4173",
      );
      await service.tx(async (c) => {
        await c.query(
          "INSERT INTO users(id,login,identity_subject,display_name,password_hash,mfa_enabled) VALUES($1,$2,$3,$4,$5,$6)",
          [id, login, "test:" + id, "Synthetic " + role, state.hash, enabled],
        );
        if (enabled)
          await c.query(
            "INSERT INTO mfa_credentials(user_id,encrypted_secret,activated_at) VALUES($1,$2,now())",
            [
              id,
              encrypt(otp.secret.base32, Buffer.from(state.key, "base64"), id),
            ],
          );
        await c.query(
          "INSERT INTO user_roles(id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE code=$3",
          [randomUUID(), id, role === "Unenrolled" ? "Viewer" : role],
        );
      });
      process.stdout.write(
        JSON.stringify({
          id,
          login,
          password: state.password,
          secret: otp.secret.base32,
          schema,
        }),
      );
    } else throw new Error("INVALID_TEST_COMMAND");
  } finally {
    await db.close();
  }
}
