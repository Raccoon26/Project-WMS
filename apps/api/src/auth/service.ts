import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  digest,
  token,
  equalDigest,
  encrypt,
  decrypt,
  totpStep,
  newTotp,
  recoveryCodes,
  passwordHash,
  passwordVerify,
  normalizeLogin,
} from "./crypto.js";
import {
  allowed,
  recentReauth,
  permissionCodes,
  rolePolicies,
} from "./policy.js";
import type { Grant, Permission } from "./policy.js";
export class AuthError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "INVALID_INPUT"
      | "CONFLICT"
      | "RATE_LIMITED"
      | "REAUTH_REQUIRED"
      | "SERVICE_UNAVAILABLE",
    public status: number,
  ) {
    super(code);
  }
}
export interface Session {
  id: string;
  user_id: string | null;
  csrf_hash: string;
  mfa_verified: boolean;
  reauthenticated_at: Date | null;
  session_epoch: number;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  status?: string;
  login?: string;
  display_name?: string;
  locale?: string;
  mfa_enabled?: boolean;
}
export interface Context {
  token?: string;
  csrf?: string;
  origin?: string;
  ip: string;
  requestId: string;
}
export interface Issued {
  token: string;
  csrf: string;
  stage: "anonymous" | "mfa" | "enroll" | "authenticated";
}
let dummyHash: Promise<string> | undefined;
export class AuthService {
  private dummy: Promise<string>;
  constructor(
    public pool: Pool,
    private key: Buffer,
    public origin: string,
  ) {
    this.dummy = dummyHash ??= passwordHash(token());
  }
  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const result = await fn(c);
      await c.query("COMMIT");
      return result;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  async audit(
    c: PoolClient,
    actor: string | null,
    action: string,
    target: string | null,
    result: string,
    requestId: string,
    before?: unknown,
    after?: unknown,
  ) {
    await c.query("SELECT pg_advisory_xact_lock(74003)");
    const previous =
      (
        await c.query(
          "SELECT event_digest FROM audit_events ORDER BY sequence DESC LIMIT 1",
        )
      ).rows[0]?.event_digest ?? "genesis";
    const id = randomUUID();
    const safe = {
      id,
      actor,
      action,
      target,
      result,
      requestId,
      before: before === undefined ? null : digest(JSON.stringify(before)),
      after: after === undefined ? null : digest(JSON.stringify(after)),
      previous,
      occurredAt: new Date().toISOString(),
      policyVersion: 1,
    };
    await c.query(
      "INSERT INTO audit_events(id,actor_id,action,target_id,result_code,request_id,before_digest,after_digest,previous_digest,event_digest,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        id,
        actor,
        action,
        target,
        result,
        requestId,
        safe.before,
        safe.after,
        previous,
        digest(JSON.stringify(safe)),
        safe.occurredAt,
      ],
    );
  }
  async recordDenied(ctx: Context, result: string) {
    await this.tx(async (c) => {
      const actor =
        (
          await c.query("SELECT user_id FROM sessions WHERE token_hash=$1", [
            digest(ctx.token ?? ""),
          ])
        ).rows[0]?.user_id ?? null;
      await this.audit(
        c,
        actor,
        "authorization.denied",
        null,
        result,
        ctx.requestId,
      );
    });
  }
  async seedRoles(c: PoolClient) {
    for (const code of permissionCodes)
      await c.query(
        "INSERT INTO permissions(code,description) VALUES($1,$1) ON CONFLICT DO NOTHING",
        [code],
      );
    for (const [code, perms] of Object.entries(rolePolicies)) {
      const row = (
        await c.query(
          "INSERT INTO roles(id,code) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET code=excluded.code RETURNING id",
          [randomUUID(), code],
        )
      ).rows[0];
      for (const p of perms)
        await c.query(
          "INSERT INTO role_permissions VALUES($1,$2) ON CONFLICT DO NOTHING",
          [row.id, p],
        );
    }
  }
  async bootstrap(
    login: string,
    password: string,
    name: string,
    secret: string,
    code: string,
  ) {
    const normalized = normalizeLogin(login);
    // Validate the local enrollment factor at receipt, before the bounded Argon2 work.
    const step = totpStep(secret, code);
    if (step === null) throw new AuthError("UNAUTHORIZED", 401);
    const hash = await passwordHash(password);
    const codes = recoveryCodes();
    const id = randomUUID();
    await this.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(74002)");
      if (
        (await c.query("SELECT 1 FROM auth_bootstrap")).rowCount ||
        (await c.query("SELECT 1 FROM users")).rowCount
      )
        throw new AuthError("CONFLICT", 409);
      await this.seedRoles(c);
      await c.query(
        "INSERT INTO users(id,login,identity_subject,display_name,password_hash,mfa_enabled) VALUES($1,$2,$3,$4,$5,true)",
        [id, normalized, "local:" + id, name, hash],
      );
      await c.query(
        "INSERT INTO mfa_credentials(user_id,encrypted_secret,activated_at,last_step) VALUES($1,$2,now(),$3)",
        [id, encrypt(secret, this.key, id), step],
      );
      await c.query(
        "INSERT INTO user_roles(id,user_id,role_id,granted_by) SELECT $1,$2,id,$2 FROM roles WHERE code='Administrator'",
        [randomUUID(), id],
      );
      await c.query("INSERT INTO auth_bootstrap(user_id) VALUES($1)", [id]);
      await this.storeCodes(c, id, codes);
      await this.audit(
        c,
        id,
        "administrator.bootstrap",
        id,
        "SUCCESS",
        "local-bootstrap",
      );
    });
    return { id, codes };
  }
  async rate(kind: string, identity: string, max: number, windowSeconds = 600) {
    // Committed separately: failed auth transactions must not roll back throttling.
    const r = await this.pool.query(
      `INSERT INTO auth_attempts(bucket,attempts) VALUES($1,1)
 ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_at < now()-($2*interval '1 second') THEN 1 ELSE auth_attempts.attempts+1 END,
 window_at=CASE WHEN auth_attempts.window_at < now()-($2*interval '1 second') THEN now() ELSE auth_attempts.window_at END RETURNING attempts`,
      [kind + ":" + digest(identity), windowSeconds],
    );
    if (r.rows[0].attempts > max) throw new AuthError("RATE_LIMITED", 429);
  }
  async readSession(
    c: PoolClient,
    ctx: Context,
    full = true,
  ): Promise<Session> {
    const r = await c.query(
      `SELECT s.*,u.status,u.login,u.display_name,u.locale,u.mfa_enabled FROM sessions s LEFT JOIN users u ON u.id=s.user_id
 WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now()
 AND (s.user_id IS NULL OR (u.status='active' AND u.session_epoch=s.session_epoch)) FOR UPDATE OF s`,
      [digest(ctx.token ?? "")],
    );
    const s = r.rows[0] as Session | undefined;
    if (!s || (full && (!s.user_id || !s.mfa_verified || !s.mfa_enabled)))
      throw new AuthError("UNAUTHORIZED", 401);
    if (s.user_id) {
      // All user security mutations lock the same user row; requests re-evaluate grants.
      const user = await c.query(
        "SELECT status,session_epoch FROM users WHERE id=$1 FOR UPDATE",
        [s.user_id],
      );
      if (
        user.rows[0].status !== "active" ||
        user.rows[0].session_epoch !== s.session_epoch
      )
        throw new AuthError("UNAUTHORIZED", 401);
    }
    const touched = await c.query(
      "UPDATE sessions SET last_activity_at=now(),idle_expires_at=LEAST(absolute_expires_at,now()+interval '30 minutes') WHERE id=$1 RETURNING idle_expires_at",
      [s.id],
    );
    s.idle_expires_at = touched.rows[0].idle_expires_at;
    return s;
  }
  csrf(ctx: Context, s: Session) {
    if (
      ctx.origin !== this.origin ||
      !ctx.csrf ||
      !equalDigest(ctx.csrf, s.csrf_hash)
    )
      throw new AuthError("FORBIDDEN", 403);
  }
  async issue(
    c: PoolClient,
    user: string | null,
    epoch = 0,
    verified = false,
    reauth = false,
  ): Promise<Issued> {
    const raw = token(),
      csrf = token();
    await c.query(
      `INSERT INTO sessions(id,user_id,token_hash,csrf_hash,session_epoch,mfa_verified,reauthenticated_at,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7 THEN now() ELSE NULL END,CASE WHEN $2::uuid IS NOT NULL AND NOT $6 THEN now()+interval '5 minutes' ELSE now()+interval '30 minutes' END,CASE WHEN $2::uuid IS NOT NULL AND NOT $6 THEN now()+interval '5 minutes' ELSE now()+interval '12 hours' END)`,
      [randomUUID(), user, digest(raw), digest(csrf), epoch, verified, reauth],
    );
    return {
      token: raw,
      csrf,
      stage: verified ? "authenticated" : user ? "mfa" : "anonymous",
    };
  }
  async csrfSession(ctx: Context): Promise<{ csrf: string; issued?: Issued }> {
    await this.rate("session-ip", ctx.ip, 120, 60);
    return this.tx(async (c) => {
      let s: Session | undefined;
      try {
        s = await this.readSession(c, ctx, false);
      } catch (e) {
        if (!(e instanceof AuthError)) throw e;
      }
      // CSRF fetch rotates only CSRF material, never exposes the opaque session token.
      if (s) {
        const csrf = token();
        await c.query("UPDATE sessions SET csrf_hash=$1 WHERE id=$2", [
          digest(csrf),
          s.id,
        ]);
        return { csrf };
      }
      const issued = await this.issue(c, null);
      return { csrf: issued.csrf, issued };
    });
  }
  async grants(c: PoolClient, user: string): Promise<Grant[]> {
    return (
      await c.query(
        `SELECT p.code AS permission,CASE WHEN ur.scope='global' THEN 'global' ELSE ur.warehouse_id::text END AS scope,ur.policy_version AS "policyVersion" FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.code=rp.permission_code WHERE ur.user_id=$1 AND ur.revoked_at IS NULL AND r.active AND p.active AND ur.policy_version=r.policy_version`,
        [user],
      )
    ).rows;
  }
  async require(
    c: PoolClient,
    s: Session,
    permission: Permission,
    ctx: Context,
    reauth = false,
  ) {
    if (!s.user_id || !allowed(await this.grants(c, s.user_id), permission))
      throw new AuthError("FORBIDDEN", 403);
    if (reauth && !recentReauth(s.reauthenticated_at))
      throw new AuthError("REAUTH_REQUIRED", 403);
    void ctx;
  }
  async login(ctx: Context, login: string, password: string) {
    await this.rate("login-ip", ctx.ip, 40);
    await this.rate("login-account", login.trim().toLowerCase(), 10);
    const result = await this.tx(async (c) => {
      const s = await this.readSession(c, ctx, false);
      this.csrf(ctx, s);
      let normalized = "";
      try {
        normalized = normalizeLogin(login);
      } catch {
        /* identical failure */
      }
      const user = (
        await c.query("SELECT * FROM users WHERE login=$1 FOR UPDATE", [
          normalized,
        ])
      ).rows[0];
      const valid = await passwordVerify(
        user?.password_hash ?? (await this.dummy),
        password,
      );
      if (!valid || !user || user.status !== "active") {
        await this.audit(
          c,
          null,
          "login.failed",
          null,
          "INVALID_CREDENTIALS",
          ctx.requestId,
        );
        return null;
      }
      await c.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [s.id]);
      const issued = await this.issue(c, user.id, user.session_epoch);
      issued.stage = user.mfa_enabled ? "mfa" : "enroll";
      await this.audit(
        c,
        user.id,
        "password.verified",
        user.id,
        "MFA_REQUIRED",
        ctx.requestId,
      );
      return issued;
    });
    if (!result) throw new AuthError("UNAUTHORIZED", 401);
    return result;
  }
  async consumeFactor(
    c: PoolClient,
    user: string,
    code: string,
    recovery = false,
  ): Promise<boolean> {
    if (recovery) {
      const r = await c.query(
        "UPDATE mfa_codes SET consumed_at=now() WHERE user_id=$1 AND code_hash=$2 AND consumed_at IS NULL RETURNING id",
        [user, digest(code)],
      );
      return r.rowCount === 1;
    }
    const credential = (
      await c.query(
        "SELECT * FROM mfa_credentials WHERE user_id=$1 AND activated_at IS NOT NULL AND revoked_at IS NULL FOR UPDATE",
        [user],
      )
    ).rows[0];
    if (!credential) return false;
    const step = totpStep(
      decrypt(credential.encrypted_secret, this.key, user),
      code,
    );
    if (step === null || step <= Number(credential.last_step)) return false;
    await c.query("UPDATE mfa_credentials SET last_step=$1 WHERE user_id=$2", [
      step,
      user,
    ]);
    return true;
  }
  async verifyMfa(ctx: Context, code: string, recovery = false) {
    await this.rate("mfa", ctx.token ?? ctx.ip, 8);
    await this.rate("mfa-ip", ctx.ip, 40);
    const pendingUser = (
      await this.pool.query(
        "SELECT user_id FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL",
        [digest(ctx.token ?? "")],
      )
    ).rows[0]?.user_id;
    if (pendingUser) await this.rate("mfa-account", pendingUser, 8);
    const result = await this.tx(async (c) => {
      const s = await this.readSession(c, ctx, false);
      this.csrf(ctx, s);
      if (!s.user_id || s.mfa_verified)
        throw new AuthError("UNAUTHORIZED", 401);
      if (!(await this.consumeFactor(c, s.user_id, code, recovery))) {
        await this.audit(
          c,
          s.user_id,
          "mfa.failed",
          s.user_id,
          "INVALID_FACTOR",
          ctx.requestId,
        );
        return null;
      }
      await c.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [s.id]);
      await c.query("UPDATE users SET last_login_at=now() WHERE id=$1", [
        s.user_id,
      ]);
      const issued = await this.issue(
        c,
        s.user_id,
        s.session_epoch,
        true,
        true,
      );
      await this.audit(
        c,
        s.user_id,
        "mfa.success",
        s.user_id,
        recovery ? "RECOVERY_USED" : "TOTP_VERIFIED",
        ctx.requestId,
      );
      await this.audit(
        c,
        s.user_id,
        "login.success",
        s.user_id,
        recovery ? "RECOVERY_USED" : "MFA_VERIFIED",
        ctx.requestId,
      );
      return issued;
    });
    if (!result) throw new AuthError("UNAUTHORIZED", 401);
    return result;
  }
  async reauth(ctx: Context, password: string, code: string) {
    await this.rate("reauth", ctx.token ?? ctx.ip, 8);
    const r = await this.tx(async (c) => {
      const s = await this.readSession(c, ctx);
      this.csrf(ctx, s);
      const u = (
        await c.query("SELECT password_hash FROM users WHERE id=$1", [
          s.user_id,
        ])
      ).rows[0];
      if (
        !(await passwordVerify(u.password_hash, password)) ||
        !(await this.consumeFactor(c, s.user_id!, code))
      ) {
        await this.audit(
          c,
          s.user_id,
          "reauth.failed",
          s.user_id,
          "INVALID_CREDENTIALS",
          ctx.requestId,
        );
        return null;
      }
      await c.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [s.id]);
      const issued = await this.issue(
        c,
        s.user_id,
        s.session_epoch,
        true,
        true,
      );
      await this.audit(
        c,
        s.user_id,
        "reauth.success",
        s.user_id,
        "SUCCESS",
        ctx.requestId,
      );
      return issued;
    });
    if (!r) throw new AuthError("UNAUTHORIZED", 401);
    return r;
  }
  async authorize(
    ctx: Context,
    permission: Permission,
    write = false,
    reauth = false,
  ) {
    return this.tx(async (c) => {
      const s = await this.readSession(c, ctx);
      if (write) this.csrf(ctx, s);
      await this.require(c, s, permission, ctx, reauth);
    });
  }
  async me(ctx: Context) {
    return this.tx(async (c) => {
      const s = await this.readSession(c, ctx);
      const grants = await this.grants(c, s.user_id!);
      const roles = (
        await c.query(
          "SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1 AND ur.revoked_at IS NULL AND r.active",
          [s.user_id],
        )
      ).rows.map((r) => r.code);
      return {
        id: s.user_id,
        login: s.login,
        displayName: s.display_name,
        locale: s.locale,
        mfaEnabled: s.mfa_enabled,
        expiresAt: new Date(
          Math.min(
            s.idle_expires_at.getTime(),
            s.absolute_expires_at.getTime(),
          ),
        ).toISOString(),
        roles,
        permissions: [
          ...new Set(
            grants.filter((g) => g.scope === "global").map((g) => g.permission),
          ),
        ],
        grants,
      };
    });
  }
  async mutate<T>(
    ctx: Context,
    fn: (c: PoolClient, s: Session) => Promise<T>,
    permission?: Permission,
  ) {
    await this.rate("mutation-ip", ctx.ip, 100, 60);
    // Shared lock ordering for mutations prevents last-admin races and cross-user deadlocks.
    return this.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(74002)");
      const s = await this.readSession(c, ctx);
      this.csrf(ctx, s);
      if (permission) await this.require(c, s, permission, ctx, true);
      return fn(c, s);
    });
  }
  async logout(ctx: Context) {
    return this.tx(async (c) => {
      const s = await this.readSession(c, ctx, false);
      this.csrf(ctx, s);
      await c.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [s.id]);
      await this.audit(
        c,
        s.user_id,
        "logout",
        s.user_id,
        "SUCCESS",
        ctx.requestId,
      );
    });
  }
  async enroll(ctx: Context) {
    return this.tx(async (c) => {
      const s = await this.readSession(c, ctx, false);
      this.csrf(ctx, s);
      if (!s.user_id) throw new AuthError("UNAUTHORIZED", 401);
      if (
        s.mfa_enabled &&
        (!s.mfa_verified || !recentReauth(s.reauthenticated_at))
      )
        throw new AuthError("REAUTH_REQUIRED", 403);
      const otp = newTotp(s.login!);
      const encrypted = encrypt(otp.secret.base32, this.key, s.user_id);
      await c.query(
        "INSERT INTO mfa_credentials(user_id,encrypted_secret,pending_secret) VALUES($1,$2,$2) ON CONFLICT(user_id) DO UPDATE SET pending_secret=$2",
        [s.user_id, encrypted],
      );
      await this.audit(
        c,
        s.user_id,
        "mfa.enroll.started",
        s.user_id,
        "SUCCESS",
        ctx.requestId,
      );
      return { uri: otp.toString(), secret: otp.secret.base32 };
    });
  }
  async storeCodes(c: PoolClient, user: string, codes: string[]) {
    await c.query("DELETE FROM mfa_codes WHERE user_id=$1", [user]);
    for (const code of codes)
      await c.query(
        "INSERT INTO mfa_codes(id,user_id,code_hash) VALUES($1,$2,$3)",
        [randomUUID(), user, digest(code)],
      );
  }
  async confirm(ctx: Context, code: string) {
    await this.rate("mfa-enroll", ctx.token ?? ctx.ip, 8);
    return this.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(74002)");
      const s = await this.readSession(c, ctx, false);
      this.csrf(ctx, s);
      if (!s.user_id) throw new AuthError("UNAUTHORIZED", 401);
      if (
        s.mfa_enabled &&
        (!s.mfa_verified || !recentReauth(s.reauthenticated_at))
      )
        throw new AuthError("REAUTH_REQUIRED", 403);
      const credential = (
        await c.query(
          "SELECT pending_secret FROM mfa_credentials WHERE user_id=$1 FOR UPDATE",
          [s.user_id],
        )
      ).rows[0];
      if (!credential?.pending_secret) throw new AuthError("CONFLICT", 409);
      const step = totpStep(
        decrypt(credential.pending_secret, this.key, s.user_id),
        code,
      );
      if (step === null) throw new AuthError("UNAUTHORIZED", 401);
      await c.query(
        "UPDATE mfa_credentials SET encrypted_secret=pending_secret,pending_secret=NULL,activated_at=now(),last_step=$1,revoked_at=NULL WHERE user_id=$2",
        [step, s.user_id],
      );
      await c.query(
        "UPDATE users SET mfa_enabled=true,session_epoch=session_epoch+1,updated_at=now() WHERE id=$1",
        [s.user_id],
      );
      await c.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1", [
        s.user_id,
      ]);
      const codes = recoveryCodes();
      await this.storeCodes(c, s.user_id, codes);
      const issued = await this.issue(
        c,
        s.user_id,
        s.session_epoch + 1,
        true,
        true,
      );
      await this.audit(
        c,
        s.user_id,
        s.mfa_enabled ? "mfa.replaced" : "mfa.enabled",
        s.user_id,
        "SUCCESS",
        ctx.requestId,
      );
      return { issued, codes };
    });
  }
  async lastAdmin(c: PoolClient, user: string) {
    const isAdmin = (
      await c.query(
        "SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND ur.revoked_at IS NULL AND ur.scope='global' AND r.code='Administrator'",
        [user],
      )
    ).rowCount;
    if (!isAdmin) return;
    const count = (
      await c.query(
        "SELECT count(DISTINCT u.id) AS n FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='active' AND u.mfa_enabled AND ur.revoked_at IS NULL AND r.active AND ur.policy_version=r.policy_version AND r.policy_version=1 AND ur.scope='global' AND r.code='Administrator'",
      )
    ).rows[0].n;
    if (Number(count) <= 1) throw new AuthError("CONFLICT", 409);
  }
  async disableMfa(ctx: Context) {
    return this.mutate(ctx, async (c, s) => {
      if (!recentReauth(s.reauthenticated_at))
        throw new AuthError("REAUTH_REQUIRED", 403);
      await this.lastAdmin(c, s.user_id!);
      await c.query(
        "UPDATE users SET mfa_enabled=false,session_epoch=session_epoch+1 WHERE id=$1",
        [s.user_id],
      );
      await c.query(
        "UPDATE mfa_credentials SET revoked_at=now(),pending_secret=NULL WHERE user_id=$1",
        [s.user_id],
      );
      await c.query("DELETE FROM mfa_codes WHERE user_id=$1", [s.user_id]);
      await c.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1", [
        s.user_id,
      ]);
      await this.audit(
        c,
        s.user_id,
        "mfa.disabled",
        s.user_id,
        "SUCCESS",
        ctx.requestId,
      );
    });
  }
  async regenerateCodes(ctx: Context) {
    return this.mutate(ctx, async (c, s) => {
      if (!recentReauth(s.reauthenticated_at))
        throw new AuthError("REAUTH_REQUIRED", 403);
      const codes = recoveryCodes();
      await this.storeCodes(c, s.user_id!, codes);
      await this.audit(
        c,
        s.user_id,
        "mfa.codes.rotated",
        s.user_id,
        "SUCCESS",
        ctx.requestId,
      );
      return { codes };
    });
  }
  async changePassword(ctx: Context, password: string) {
    return this.mutate(ctx, async (c, s) => {
      if (!recentReauth(s.reauthenticated_at))
        throw new AuthError("REAUTH_REQUIRED", 403);
      const hash = await passwordHash(password);
      await c.query(
        "UPDATE users SET password_hash=$1,password_changed_at=now(),session_epoch=session_epoch+1 WHERE id=$2",
        [hash, s.user_id],
      );
      await c.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1", [
        s.user_id,
      ]);
      await this.audit(
        c,
        s.user_id,
        "password.changed",
        s.user_id,
        "SUCCESS",
        ctx.requestId,
      );
    });
  }
  async revokeSessions(ctx: Context) {
    return this.mutate(ctx, async (c, s) => {
      if (!recentReauth(s.reauthenticated_at))
        throw new AuthError("REAUTH_REQUIRED", 403);
      await c.query(
        "UPDATE users SET session_epoch=session_epoch+1 WHERE id=$1",
        [s.user_id],
      );
      await c.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1", [
        s.user_id,
      ]);
      await this.audit(
        c,
        s.user_id,
        "sessions.revoked",
        s.user_id,
        "SUCCESS",
        ctx.requestId,
      );
    });
  }
  async list(
    ctx: Context,
    kind: "users" | "roles" | "audit",
    limit: number,
    cursor: string | undefined,
    search?: string,
  ) {
    return this.tx(async (c) => {
      const s = await this.readSession(c, ctx);
      await this.require(
        c,
        s,
        kind === "audit"
          ? "audit.read"
          : kind === "roles"
            ? "roles.read"
            : "users.read",
        ctx,
      );
      const sql =
        kind === "users"
          ? "SELECT id,login,display_name,locale,status,mfa_enabled,ARRAY(SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=users.id AND ur.revoked_at IS NULL AND ur.scope='global' AND r.active) AS roles FROM users WHERE ($2::uuid IS NULL OR id>$2) AND ($3::text IS NULL OR login ILIKE $3 OR display_name ILIKE $3) ORDER BY id LIMIT $1"
          : kind === "roles"
            ? "SELECT id,code,active,policy_version,ARRAY(SELECT rp.permission_code FROM role_permissions rp WHERE rp.role_id=roles.id) AS permissions FROM roles WHERE ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $1"
            : "SELECT id,actor_id,action,target_id,result_code,request_id,occurred_at,sequence,previous_digest,event_digest FROM audit_events WHERE ($2::bigint IS NULL OR sequence<$2) ORDER BY sequence DESC LIMIT $1";
      const items = (
        await c.query(sql, [
          limit + 1,
          cursor ?? null,
          ...(kind === "users"
            ? [search ? "%" + search.replace(/[\\%_]/g, "\\$&") + "%" : null]
            : []),
        ])
      ).rows;
      const more = items.length > limit;
      items.splice(limit);
      return {
        items,
        nextCursor: more
          ? String(kind === "audit" ? items.at(-1)?.sequence : items.at(-1)?.id)
          : null,
        asOf: new Date().toISOString(),
      };
    });
  }
  async createUser(
    ctx: Context,
    input: {
      login: string;
      password: string;
      displayName: string;
      locale: string;
    },
  ) {
    const login = normalizeLogin(input.login);
    return this.mutate(
      ctx,
      async (c, s) => {
        const hash = await passwordHash(input.password);
        const id = randomUUID();
        if (
          (await c.query("SELECT 1 FROM users WHERE login=$1", [login]))
            .rowCount
        )
          throw new AuthError("CONFLICT", 409);
        await c.query(
          "INSERT INTO users(id,login,identity_subject,display_name,locale,password_hash) VALUES($1,$2,$3,$4,$5,$6)",
          [id, login, "local:" + id, input.displayName, input.locale, hash],
        );
        await this.audit(
          c,
          s.user_id,
          "user.created",
          id,
          "SUCCESS",
          ctx.requestId,
        );
        return { id };
      },
      "users.manage",
    );
  }
  async updateUser(
    ctx: Context,
    id: string,
    input: { status?: string; displayName?: string; locale?: string },
  ) {
    return this.mutate(
      ctx,
      async (c, s) => {
        const old = (
          await c.query(
            "SELECT status,display_name,locale FROM users WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!old) throw new AuthError("NOT_FOUND", 404);
        if (input.status && input.status !== "active")
          await this.lastAdmin(c, id);
        await c.query(
          "UPDATE users SET status=COALESCE($1,status),display_name=COALESCE($2,display_name),locale=COALESCE($3,locale),session_epoch=session_epoch+1,updated_at=now() WHERE id=$4",
          [
            input.status ?? null,
            input.displayName ?? null,
            input.locale ?? null,
            id,
          ],
        );
        await this.audit(
          c,
          s.user_id,
          input.status && input.status !== "active"
            ? "user.deactivated"
            : "user.updated",
          id,
          "SUCCESS",
          ctx.requestId,
          old,
          input,
        );
        return { id };
      },
      "users.manage",
    );
  }
  async setRoles(ctx: Context, id: string, codes: string[]) {
    return this.mutate(
      ctx,
      async (c, s) => {
        if (id === s.user_id) throw new AuthError("FORBIDDEN", 403);
        if (
          !(await c.query("SELECT 1 FROM users WHERE id=$1 FOR UPDATE", [id]))
            .rowCount
        )
          throw new AuthError("NOT_FOUND", 404);
        const selected = (
          await c.query(
            "SELECT id,code FROM roles WHERE code=ANY($1::text[]) AND active",
            [codes],
          )
        ).rows;
        if (
          selected.length !== codes.length ||
          new Set(codes).size !== codes.length
        )
          throw new AuthError("INVALID_INPUT", 400);
        if (!codes.includes("Administrator")) await this.lastAdmin(c, id);
        const before = (
          await c.query(
            "SELECT ur.role_id,r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND ur.revoked_at IS NULL AND ur.scope='global'",
            [id],
          )
        ).rows;
        await c.query(
          "UPDATE user_roles SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL AND scope='global'",
          [id],
        );
        for (const role of selected)
          await c.query(
            "INSERT INTO user_roles(id,user_id,role_id,granted_by) VALUES($1,$2,$3,$4)",
            [randomUUID(), id, role.id, s.user_id],
          );
        for (const role of before)
          if (!codes.includes(role.code))
            await this.audit(
              c,
              s.user_id,
              "role.revoked",
              id,
              "SUCCESS",
              ctx.requestId,
              { role: role.code },
              null,
            );
        for (const code of codes)
          if (!before.some((r) => r.code === code))
            await this.audit(
              c,
              s.user_id,
              "role.granted",
              id,
              "SUCCESS",
              ctx.requestId,
              null,
              { role: code },
            );
        if (
          before.some((r) => r.code === "Administrator") !==
          codes.includes("Administrator")
        )
          await this.audit(
            c,
            s.user_id,
            "administrator.role.changed",
            id,
            "SUCCESS",
            ctx.requestId,
            before.map((r) => r.code),
            codes,
          );
        await this.audit(
          c,
          s.user_id,
          "roles.changed",
          id,
          "SUCCESS",
          ctx.requestId,
          before,
          codes,
        );
        return { id };
      },
      "roles.manage",
    );
  }
}
