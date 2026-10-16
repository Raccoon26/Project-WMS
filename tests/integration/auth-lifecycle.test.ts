import { it, expect } from "vitest";
import { authFixture } from "../auth-helper";
import { digest, totpCode, decrypt } from "../../apps/api/src/auth/crypto";
import type { Context, Issued } from "../../apps/api/src/auth/service";
it("MFA device replacement, recovery-code regeneration and disabling are atomic real PostgreSQL transitions", async () => {
  const f = await authFixture();
  try {
    await f.login();
    const created = await f.request("users", {
      login: "lifecycle-user",
      password: f.password,
      displayName: "Synthetic Lifecycle",
      locale: "ja",
    });
    expect(created.statusCode).toBe(200);
    const id = created.json().id;
    const base = {
      ip: "synthetic-lifecycle",
      origin: f.origin,
      requestId: "lifecycle",
    };
    const context = (issued: Issued): Context => ({
      ...base,
      token: issued.token,
      csrf: issued.csrf,
    });
    const anonymous = await f.service.csrfSession(base);
    const pending = await f.service.login(
      context(anonymous.issued!),
      "lifecycle-user",
      f.password,
    );
    const enrollment = await f.service.enroll(context(pending));
    const initial = await f.service.confirm(
      context(pending),
      totpCode(enrollment.secret),
    );
    const initialContext = context(initial.issued);
    const renewed = await f.service.regenerateCodes(initialContext);
    expect(renewed.codes).toHaveLength(10);
    expect(
      (
        await f.db.pool.query("SELECT 1 FROM mfa_codes WHERE code_hash=$1", [
          digest(initial.codes[0]!),
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await f.db.pool.query("SELECT 1 FROM mfa_codes WHERE code_hash=$1", [
          digest(renewed.codes[0]!),
        ])
      ).rowCount,
    ).toBe(1);
    const replacement = await f.service.enroll(initialContext);
    expect(replacement.secret).not.toBe(enrollment.secret);
    const confirmed = await f.service.confirm(
      initialContext,
      totpCode(replacement.secret),
    );
    await expect(f.service.me(initialContext)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const credential = (
      await f.db.pool.query(
        "SELECT encrypted_secret FROM mfa_credentials WHERE user_id=$1",
        [id],
      )
    ).rows[0];
    expect(decrypt(credential.encrypted_secret, f.key, id)).toBe(
      replacement.secret,
    );
    expect(
      (
        await f.db.pool.query("SELECT 1 FROM mfa_codes WHERE code_hash=$1", [
          digest(renewed.codes[0]!),
        ])
      ).rowCount,
    ).toBe(0);
    await f.service.disableMfa(context(confirmed.issued));
    await expect(f.service.me(context(confirmed.issued))).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
    expect(
      (await f.db.pool.query("SELECT mfa_enabled FROM users WHERE id=$1", [id]))
        .rows[0].mfa_enabled,
    ).toBe(false);
    expect(
      (await f.db.pool.query("SELECT 1 FROM mfa_codes WHERE user_id=$1", [id]))
        .rowCount,
    ).toBe(0);
    expect(
      (await f.request("users/" + id, { status: "inactive" }, "PATCH"))
        .statusCode,
    ).toBe(200);
    const next = await f.service.csrfSession(base);
    await expect(
      f.service.login(context(next.issued!), "lifecycle-user", f.password),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(
      (
        await f.request(
          "users/" + id,
          { status: "active", locale: "en" },
          "PATCH",
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await f.service.login(
          context(next.issued!),
          "lifecycle-user",
          f.password,
        )
      ).stage,
    ).toBe("enroll");
  } finally {
    await f.cleanup();
  }
});
it("explicit all-session revocation preserves the account and permits fresh password plus one-use recovery login", async () => {
  const f = await authFixture();
  try {
    await f.login();
    const before = f.cookie;
    expect((await f.request("auth/sessions/revoke", {})).statusCode).toBe(200);
    expect(
      (
        await f.app.inject({
          url: "/api/v1/auth/me",
          headers: { cookie: before },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await f.db.pool.query("SELECT session_epoch FROM users WHERE id=$1", [
          f.bootstrap.id,
        ])
      ).rows[0].session_epoch,
    ).toBe(1);
    await f.request("auth/csrf");
    expect(
      (
        await f.request("auth/login", {
          login: "administrator",
          password: f.password,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await f.request("auth/mfa/verify", {
          code: f.bootstrap.codes[0],
          recovery: true,
        })
      ).statusCode,
    ).toBe(200);
    expect((await f.request("auth/me")).statusCode).toBe(200);
  } finally {
    await f.cleanup();
  }
});
