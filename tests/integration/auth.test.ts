import { beforeEach, afterEach, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { authFixture } from "../auth-helper";
import { digest, newTotp, totpCode } from "../../apps/api/src/auth/crypto";
let f: Awaited<ReturnType<typeof authFixture>>;
beforeEach(async () => {
  f = await authFixture();
});
afterEach(async () => {
  await f?.cleanup();
});
it("auth: session", async () => {
  expect((await f.login()).statusCode).toBe(200);
  expect((await f.request("auth/me")).statusCode).toBe(200);
  const rows = (await f.db.pool.query("SELECT token_hash FROM sessions")).rows;
  expect(
    rows.some((r) => r.token_hash === digest(f.cookie.split("=")[1]!)),
  ).toBe(true);
  expect(rows.some((r) => r.token_hash === f.cookie.split("=")[1])).toBe(false);
  expect((await f.request("auth/logout", {})).statusCode).toBe(200);
  expect((await f.request("auth/me")).statusCode).toBe(401);
});
it("auth: CSRF", async () => {
  await f.login();
  for (const headers of [
    { "x-csrf-token": "" },
    { "x-csrf-token": "tampered" },
    { origin: "https://evil.example" },
  ])
    expect(
      (await f.request("auth/logout", {}, "POST", headers)).statusCode,
    ).toBe(403);
  expect((await f.request("auth/me")).statusCode).toBe(200);
});
it("auth: privilege escalation", async () => {
  await f.login();
  const id = f.bootstrap.id;
  expect(
    (
      await f.request(
        "users/" + id + "/roles",
        { roles: ["Administrator"] },
        "PUT",
      )
    ).statusCode,
  ).toBe(403);
  await f.db.pool.query(
    "UPDATE user_roles SET revoked_at=now() WHERE user_id=$1",
    [id],
  );
  expect((await f.request("users")).statusCode).toBe(403);
  expect(
    (
      await f.request("users", {
        login: "attacker",
        password: f.password,
        displayName: "Attacker",
        locale: "ja",
      })
    ).statusCode,
  ).toBe(403);
});
it("users and permissions have unique active grants, normalized logins and FK enforcement", async () => {
  await f.login();
  const r = await f.request("users", {
    login: " USER-NEW ",
    password: f.password,
    displayName: "Synthetic User",
    locale: "en",
  });
  expect(r.statusCode).toBe(200);
  const id = r.json().id;
  expect(
    (
      await f.request("users", {
        login: "user-new",
        password: f.password,
        displayName: "Duplicate",
        locale: "ja",
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (await f.request("users/" + id + "/roles", { roles: ["Viewer"] }, "PUT"))
      .statusCode,
  ).toBe(200);
  await expect(
    f.db.pool.query(
      "INSERT INTO user_roles(id,user_id,role_id) SELECT $1,user_id,role_id FROM user_roles WHERE user_id=$2 AND revoked_at IS NULL",
      [randomUUID(), id],
    ),
  ).rejects.toThrow();
  await expect(
    f.db.pool.query(
      "INSERT INTO user_roles(id,user_id,role_id,scope) SELECT $1,user_id,role_id,$2 FROM user_roles LIMIT 1",
      [randomUUID(), "unknown-warehouse"],
    ),
  ).rejects.toThrow();
  expect((await f.request("roles")).json().items).toHaveLength(5);
});
it("MFA enrollment is atomic and recovery codes are stored only as hashes", async () => {
  await f.login();
  const result = await f.request("users", {
    login: "new-user",
    password: f.password,
    displayName: "Synthetic",
    locale: "ja",
  });
  const id = result.json().id;
  const s = await f.service.tx((c) => f.service.issue(c, id));
  const context = {
    token: s.token,
    csrf: s.csrf,
    origin: f.origin,
    requestId: "enroll-test",
    ip: "synthetic",
  };
  const registration = await f.service.enroll(context);
  const current = totpCode(registration.secret);
  const confirmation = await f.service.confirm(context, current);
  expect(confirmation.codes).toHaveLength(10);
  expect(
    (await f.db.pool.query("SELECT mfa_enabled FROM users WHERE id=$1", [id]))
      .rows[0].mfa_enabled,
  ).toBe(true);
  const hashes = await f.db.pool.query(
    "SELECT code_hash FROM mfa_codes WHERE user_id=$1",
    [id],
  );
  expect(hashes.rows.map((r) => r.code_hash)).toContain(
    digest(confirmation.codes[0]!),
  );
  expect(JSON.stringify(hashes.rows)).not.toContain(confirmation.codes[0]);
});
it("concurrent TOTP verification consumes a time step once", async () => {
  await f.request("auth/csrf");
  await f.request("auth/login", {
    login: "administrator",
    password: f.password,
  });
  const result = await Promise.all([
    f.request("auth/mfa/verify", { code: f.otp.generate() }),
    f.request("auth/mfa/verify", { code: f.otp.generate() }),
  ]);
  expect(result.map((r) => r.statusCode).sort()).toEqual([200, 401]);
});
it("concurrent recovery code verification consumes one hash once", async () => {
  await f.request("auth/csrf");
  await f.request("auth/login", {
    login: "administrator",
    password: f.password,
  });
  const result = await Promise.all([
    f.request("auth/mfa/verify", {
      code: f.bootstrap.codes[0],
      recovery: true,
    }),
    f.request("auth/mfa/verify", {
      code: f.bootstrap.codes[0],
      recovery: true,
    }),
  ]);
  expect(result.map((r) => r.statusCode).sort()).toEqual([200, 401]);
  expect(
    (
      await f.db.pool.query(
        "SELECT count(*) FROM mfa_codes WHERE consumed_at IS NOT NULL",
      )
    ).rows[0].count,
  ).toBe("1");
});
it("bootstrap races cannot create a second administrator or incomplete account", async () => {
  const a = newTotp("another");
  const attempts = await Promise.allSettled([
    f.service.bootstrap(
      "another-user",
      f.password,
      "Other",
      a.secret.base32,
      a.generate(),
    ),
    f.service.bootstrap(
      "another-user",
      f.password,
      "Other",
      a.secret.base32,
      a.generate(),
    ),
  ]);
  expect(attempts.every((r) => r.status === "rejected")).toBe(true);
  expect(
    (await f.db.pool.query("SELECT count(*) FROM users")).rows[0].count,
  ).toBe("1");
});
it("audit persistence failure rolls back user changes and append-only history rejects edits", async () => {
  await f.login();
  await expect(
    f.db.pool.query("UPDATE audit_events SET result_code='changed'"),
  ).rejects.toThrow();
  await expect(f.db.pool.query("DELETE FROM audit_events")).rejects.toThrow();
  await f.db.pool.query(
    "CREATE FUNCTION reject_audit_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_insert()",
  );
  expect(
    (
      await f.request("users", {
        login: "rollback-user",
        password: f.password,
        displayName: "Rollback",
        locale: "ja",
      })
    ).statusCode,
  ).toBeGreaterThanOrEqual(500);
  expect(
    (await f.db.pool.query("SELECT 1 FROM users WHERE login='rollback-user'"))
      .rowCount,
  ).toBe(0);
});
it("role revocation is observed by existing sessions and inactive users immediately fail", async () => {
  await f.login();
  await f.db.pool.query(
    "UPDATE user_roles SET revoked_at=now() WHERE user_id=$1",
    [f.bootstrap.id],
  );
  expect((await f.request("users")).statusCode).toBe(403);
  await f.db.pool.query(
    "UPDATE users SET status='inactive',session_epoch=session_epoch+1 WHERE id=$1",
    [f.bootstrap.id],
  );
  expect((await f.request("auth/me")).statusCode).toBe(401);
});
it("migration preserves foundation data and concurrent migrations have matching history", async () => {
  await f.db.pool.query(
    "INSERT INTO foundation_metadata(key,value) VALUES('old-dev01','preserved')",
  );
  await Promise.all([f.db.migrate(), f.db.migrate()]);
  expect(await f.db.migrationStatus()).toBe(true);
  expect(
    (
      await f.db.pool.query(
        "SELECT value FROM foundation_metadata WHERE key='old-dev01'",
      )
    ).rows[0].value,
  ).toBe("preserved");
  await f.request("auth/csrf");
  await expect(
    f.db.pool.query(
      "INSERT INTO sessions(id,token_hash,csrf_hash) SELECT $1,token_hash,csrf_hash FROM sessions LIMIT 1",
      [randomUUID()],
    ),
  ).rejects.toThrow();
});
it("password change increments epoch and revokes old sessions", async () => {
  await f.login();
  const before = (
    await f.db.pool.query("SELECT session_epoch FROM users WHERE id=$1", [
      f.bootstrap.id,
    ])
  ).rows[0].session_epoch;
  expect(
    (await f.request("auth/password", { password: f.password + "-changed" }))
      .statusCode,
  ).toBe(200);
  expect(
    (
      await f.db.pool.query("SELECT session_epoch FROM users WHERE id=$1", [
        f.bootstrap.id,
      ])
    ).rows[0].session_epoch,
  ).toBe(before + 1);
  expect((await f.request("auth/me")).statusCode).toBe(401);
});
it("initial administrator simultaneous bootstrap on empty schema admits exactly one complete identity", async () => {
  const { scopedDatabase } = await import("../helpers");
  const { AuthService } = await import("../../apps/api/src/auth/service");
  const scope = await scopedDatabase(3000);
  await scope.db.migrate();
  try {
    const service = new AuthService(scope.db.pool, f.key, f.origin),
      otp = newTotp("race");
    const results = await Promise.allSettled([
      service.bootstrap(
        "race-admin-a",
        f.password,
        "Race A",
        otp.secret.base32,
        otp.generate(),
      ),
      service.bootstrap(
        "race-admin-b",
        f.password,
        "Race B",
        otp.secret.base32,
        otp.generate(),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      (await scope.db.pool.query("SELECT count(*) FROM users")).rows[0].count,
    ).toBe("1");
    expect(
      (await scope.db.pool.query("SELECT count(*) FROM user_roles")).rows[0]
        .count,
    ).toBe("1");
    expect(
      (await scope.db.pool.query("SELECT count(*) FROM mfa_codes")).rows[0]
        .count,
    ).toBe("10");
  } finally {
    await scope.cleanup();
  }
});
it("permission update and failed audit roll back as a unit", async () => {
  await f.login();
  const response = await f.request("users", {
    login: "other-viewer",
    password: f.password,
    displayName: "Other",
    locale: "ja",
  });
  const id = response.json().id;
  expect(
    (await f.request("users/" + id + "/roles", { roles: ["Viewer"] }, "PUT"))
      .statusCode,
  ).toBe(200);
  await f.db.pool.query(
    "CREATE FUNCTION reject_role_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER fail_role_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_role_audit()",
  );
  expect(
    (
      await f.request(
        "users/" + id + "/roles",
        { roles: ["Administrator"] },
        "PUT",
      )
    ).statusCode,
  ).toBeGreaterThanOrEqual(500);
  const roles = await f.db.pool.query(
    "SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND ur.revoked_at IS NULL",
    [id],
  );
  expect(roles.rows.map((r) => r.code)).toEqual(["Viewer"]);
});
