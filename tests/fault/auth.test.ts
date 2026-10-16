import { beforeEach, afterEach, it, expect } from "vitest";
import { authFixture } from "../auth-helper";
import { AuthService } from "../../apps/api/src/auth/service";
import { buildApi } from "../../apps/api/src/app";
import { logger } from "@wms/runtime";
let f: Awaited<ReturnType<typeof authFixture>>;
beforeEach(async () => {
  f = await authFixture();
});
afterEach(async () => {
  await f?.cleanup();
});
it("S01 S03: unauthenticated and password-only sessions cannot access protected API", async () => {
  expect((await f.request("users")).statusCode).toBe(401);
  await f.request("auth/csrf");
  expect(
    (
      await f.request("auth/login", {
        login: "administrator",
        password: f.password,
      })
    ).statusCode,
  ).toBe(200);
  expect((await f.request("auth/me")).statusCode).toBe(401);
  expect((await f.request("users")).statusCode).toBe(401);
});
it("S02 S19: unknown account and wrong password have identical responses and durable rate limits", async () => {
  await f.request("auth/csrf");
  const a = await f.request("auth/login", {
    login: "unknown-user",
    password: f.password,
  });
  const b = await f.request("auth/login", {
    login: "administrator",
    password: "incorrect",
  });
  expect(a.statusCode).toBe(401);
  expect(b.statusCode).toBe(401);
  expect(a.json().code).toBe(b.json().code);
  for (let i = 0; i < 10; i++)
    await f.request("auth/login", {
      login: "administrator",
      password: "incorrect",
    });
  expect(
    (
      await f.request("auth/login", {
        login: "administrator",
        password: f.password,
      })
    ).statusCode,
  ).toBe(429);
  const restarted = new AuthService(f.db.pool, f.key, f.origin);
  await expect(
    restarted.rate("login-account", "administrator", 10),
  ).rejects.toMatchObject({ status: 429 });
});
it("S04: repeated invalid MFA and recovery guesses are throttled", async () => {
  await f.request("auth/csrf");
  await f.request("auth/login", {
    login: "administrator",
    password: f.password,
  });
  for (let i = 0; i < 8; i++)
    expect(
      (
        await f.request("auth/mfa/verify", {
          code: "invalid",
          recovery: i % 2 === 0,
        })
      ).statusCode,
    ).toBe(401);
  expect(
    (await f.request("auth/mfa/verify", { code: f.otp.generate() })).statusCode,
  ).toBe(429);
});
it("S05 S08: copied session token fails after concurrent logout", async () => {
  await f.login();
  const original = f.cookie,
    csrf = f.csrf;
  const responses = await Promise.all([
    f.request("auth/logout", {}),
    f.request("auth/logout", {}),
  ]);
  expect(responses.some((r) => r.statusCode === 200)).toBe(true);
  expect(
    (
      await f.app.inject({
        url: "/api/v1/auth/me",
        headers: { cookie: original, "x-csrf-token": csrf },
      })
    ).statusCode,
  ).toBe(401);
});
it.each([
  ["S06", "idle_expires_at", "now()-interval '1 second'"],
  ["S07", "absolute_expires_at", "now()-interval '1 second'"],
])("%s: expired session fails closed", async (_id, column, value) => {
  await f.login();
  await f.db.pool.query(
    `UPDATE sessions SET ${column}=${value} WHERE mfa_verified`,
  );
  expect((await f.request("auth/me")).statusCode).toBe(401);
});
it("S11 S12 S14: Viewer and Operator cannot modify users or roles", async () => {
  await f.login();
  for (const role of ["Viewer", "Operator"]) {
    await f.db.pool.query(
      "UPDATE user_roles SET revoked_at=now() WHERE user_id=$1",
      [f.bootstrap.id],
    );
    await f.db.pool.query(
      "INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),$1,id FROM roles WHERE code=$2",
      [f.bootstrap.id, role],
    );
    expect((await f.request("users")).statusCode).toBe(403);
    expect(
      (
        await f.request(
          "users/" + f.bootstrap.id + "/roles",
          { roles: ["Administrator"] },
          "PUT",
        )
      ).statusCode,
    ).toBe(403);
  }
});
it("S15 S16 S17: CSRF is mandatory on login and bound to origin and session", async () => {
  await f.request("auth/csrf");
  for (const extra of [
    { "x-csrf-token": "" },
    { "x-csrf-token": "forged" },
    { origin: "http://evil.example" },
  ])
    expect(
      (
        await f.request(
          "auth/login",
          { login: "administrator", password: f.password },
          "POST",
          extra,
        )
      ).statusCode,
    ).toBe(403);
  const second = await f.app.inject("/api/v1/auth/csrf");
  expect(
    (
      await f.request(
        "auth/login",
        { login: "administrator", password: f.password },
        "POST",
        { "x-csrf-token": second.json().csrf },
      )
    ).statusCode,
  ).toBe(403);
});
it("S18 S28: schema rejects injected fields and no secret cookie password stack or SQL appears in logs", async () => {
  await f.request("auth/csrf");
  const secret = f.password;
  expect(
    (
      await f.request("auth/login", {
        login: "administrator",
        password: secret,
        admin: true,
      })
    ).statusCode,
  ).toBe(400);
  const r = await f.request(
    "auth/login",
    { login: "administrator", password: "incorrect" },
    "POST",
    { authorization: "Bearer " + secret, "x-forwarded-for": secret },
  );
  expect(r.statusCode).toBe(401);
  expect(JSON.stringify(r.json())).not.toMatch(
    /stack|password_hash|SELECT|cookie/i,
  );
  expect(f.logs.join("\n")).not.toContain(secret);
  expect(f.logs.join("\n")).not.toContain(f.cookie);
});
it("S20: TOTP cannot be reused in another session after successful login", async () => {
  await f.login();
  await f.request("auth/csrf");
  await f.request("auth/login", {
    login: "administrator",
    password: f.password,
  });
  expect(
    (await f.request("auth/mfa/verify", { code: f.otp.generate() })).statusCode,
  ).toBe(401);
});
it("S21: recovery code cannot be used again across sessions", async () => {
  await f.request("auth/csrf");
  await f.request("auth/login", {
    login: "administrator",
    password: f.password,
  });
  expect(
    (
      await f.request("auth/mfa/verify", {
        code: f.bootstrap.codes[0],
        recovery: true,
      })
    ).statusCode,
  ).toBe(200);
  await f.request("auth/login", {
    login: "administrator",
    password: f.password,
  });
  expect(
    (
      await f.request("auth/mfa/verify", {
        code: f.bootstrap.codes[0],
        recovery: true,
      })
    ).statusCode,
  ).toBe(401);
});
it("S22: missing security configuration never enables protected endpoints", async () => {
  const app = buildApi(
    f.db,
    logger("api", () => {}),
  );
  try {
    expect((await app.inject("/api/v1/auth/me")).statusCode).toBe(503);
    expect((await app.inject("/api/v1/health/live")).statusCode).toBe(200);
  } finally {
    await app.close();
  }
});
it("S23: fresh API instance preserves DB-backed sessions and revoked state", async () => {
  await f.login();
  const app = buildApi(
    f.db,
    logger("api", () => {}),
    { pool: f.db.pool, key: f.key.toString("base64"), origin: f.origin },
  );
  try {
    expect(
      (
        await app.inject({
          url: "/api/v1/auth/me",
          headers: { cookie: f.cookie },
        })
      ).statusCode,
    ).toBe(200);
    await f.request("auth/logout", {});
    expect(
      (
        await app.inject({
          url: "/api/v1/auth/me",
          headers: { cookie: f.cookie },
        })
      ).statusCode,
    ).toBe(401);
  } finally {
    await app.close();
  }
});
it("S25: expired reauthentication blocks even administrators", async () => {
  await f.login();
  await f.db.pool.query(
    "UPDATE sessions SET reauthenticated_at=now()-interval '5 minutes' WHERE mfa_verified",
  );
  expect(
    (
      await f.request("users", {
        login: "new-user",
        password: f.password,
        displayName: "New",
        locale: "ja",
      })
    ).statusCode,
  ).toBe(403);
  expect((await f.request("auth/mfa/recovery", {})).statusCode).toBe(403);
});
it("S26: last active administrator cannot be disabled, locked or lose MFA", async () => {
  await f.login();
  for (const status of ["inactive", "locked"])
    expect(
      (await f.request("users/" + f.bootstrap.id, { status }, "PATCH"))
        .statusCode,
    ).toBe(409);
  expect((await f.request("auth/mfa/disable", {})).statusCode).toBe(409);
  expect((await f.request("auth/me")).statusCode).toBe(200);
});
it("S29: session fixation is prevented at password and MFA boundaries", async () => {
  await f.request("auth/csrf");
  const anonymous = f.cookie;
  await f.request("auth/login", {
    login: "administrator",
    password: f.password,
  });
  const pending = f.cookie;
  expect(pending).not.toBe(anonymous);
  await f.request("auth/mfa/verify", { code: f.otp.generate() });
  expect(f.cookie).not.toBe(pending);
  for (const cookie of [anonymous, pending])
    expect(
      (await f.app.inject({ url: "/api/v1/auth/me", headers: { cookie } }))
        .statusCode,
    ).toBe(401);
});
it("S22: actual closed PostgreSQL pool cannot authenticate and reports 503 without secret leakage", async () => {
  await f.login();
  await f.db.close();
  const response = await f.request("auth/me");
  expect(response.statusCode).toBe(503);
  expect(response.json().code).toBe("SERVICE_UNAVAILABLE");
  expect(JSON.stringify(response.json())).not.toContain(f.password);
});
it("permission denial events are durably audited without raw credentials", async () => {
  await f.login();
  await f.request("auth/logout", {}, "POST", { "x-csrf-token": "forged" });
  const event = (
    await f.db.pool.query(
      "SELECT * FROM audit_events WHERE action='authorization.denied' ORDER BY sequence DESC LIMIT 1",
    )
  ).rows[0];
  expect(event.result_code).toBe("FORBIDDEN");
  expect(event.actor_id).toBe(f.bootstrap.id);
  expect(JSON.stringify(event)).not.toContain(f.password);
  expect(JSON.stringify(event)).not.toContain(f.cookie);
});
it("undeclared future routes deny by default, including misleading users prefix", async () => {
  f.app.get("/api/v1/users/unprotected", async () => ({
    forbidden: "must not escape",
  }));
  await f.login();
  expect((await f.request("users/unprotected")).statusCode).toBe(401);
});
it("explicit permission route contract enforces server authorization and CSRF", async () => {
  f.app.post(
    "/api/v1/settings/example",
    { config: { wmsPermission: "settings.manage", wmsRecentReauth: true } },
    async () => ({ ok: true }),
  );
  await f.login();
  expect((await f.request("settings/example", {})).statusCode).toBe(200);
  expect(
    (await f.request("settings/example", {}, "POST", { "x-csrf-token": "" }))
      .statusCode,
  ).toBe(403);
  await f.db.pool.query(
    "UPDATE user_roles SET revoked_at=now() WHERE user_id=$1",
    [f.bootstrap.id],
  );
  expect((await f.request("settings/example", {})).statusCode).toBe(403);
});
