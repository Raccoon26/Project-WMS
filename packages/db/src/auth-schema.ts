import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  bigint,
  uniqueIndex,
  index,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
const time = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    login: text("login").notNull().unique(),
    identitySubject: text("identity_subject").notNull().unique(),
    displayName: text("display_name").notNull(),
    locale: text("locale").notNull().default("ja"),
    status: text("status").notNull().default("active"),
    passwordHash: text("password_hash").notNull(),
    passwordChangedAt: time("password_changed_at"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    sessionEpoch: integer("session_epoch").notNull().default(0),
    createdAt: time("created_at"),
    updatedAt: time("updated_at"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "users_login_check",
      sql`${t.login} ~ '^[a-z0-9][a-z0-9._@+-]{2,63}$'`,
    ),
    check(
      "users_display_name_check",
      sql`length(${t.displayName}) BETWEEN 1 AND 100`,
    ),
    check("users_locale_check", sql`${t.locale} IN ('ja','ko','en')`),
    check(
      "users_status_check",
      sql`${t.status} IN ('active','inactive','locked')`,
    ),
    check("users_epoch_check", sql`${t.sessionEpoch} >= 0`),
  ],
);
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
  policyVersion: integer("policy_version").notNull().default(1),
});
export const permissions = pgTable("permissions", {
  code: text("code").primaryKey(),
  description: text("description").notNull(),
  active: boolean("active").notNull().default(true),
});
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .references(() => roles.id)
      .notNull(),
    permissionCode: text("permission_code")
      .references(() => permissions.code)
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionCode] })],
);
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    roleId: uuid("role_id")
      .references(() => roles.id)
      .notNull(),
    scope: text("scope").notNull().default("global"),
    grantedBy: uuid("granted_by").references(() => users.id),
    grantedAt: time("granted_at"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    policyVersion: integer("policy_version").notNull().default(1),
  },
  (t) => [
    uniqueIndex("user_roles_active")
      .on(t.userId, t.roleId, t.scope)
      .where(sql`${t.revokedAt} IS NULL`),
    check("user_roles_scope_check", sql`${t.scope} = 'global'`),
  ],
);
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    csrfHash: text("csrf_hash").notNull(),
    issuedAt: time("issued_at"),
    lastActivityAt: time("last_activity_at"),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now()+interval '30 minutes'`),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now()+interval '12 hours'`),
    reauthenticatedAt: timestamp("reauthenticated_at", { withTimezone: true }),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    sessionEpoch: integer("session_epoch").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("sessions_user")
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
    index("sessions_expiry").on(t.absoluteExpiresAt),
    check(
      "sessions_verified_user_check",
      sql`NOT ${t.mfaVerified} OR ${t.userId} IS NOT NULL`,
    ),
  ],
);
export const mfaCredentials = pgTable(
  "mfa_credentials",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id),
    method: text("method").notNull().default("totp"),
    encryptedSecret: text("encrypted_secret").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    lastStep: bigint("last_step", { mode: "bigint" })
      .notNull()
      .default(sql`-1`),
    pendingSecret: text("pending_secret"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [check("mfa_method_check", sql`${t.method} = 'totp'`)],
);
export const mfaCodes = pgTable(
  "mfa_codes",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    codeHash: text("code_hash").notNull().unique(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [index("mfa_codes_user").on(t.userId)],
);
export const authAttempts = pgTable(
  "auth_attempts",
  {
    bucket: text("bucket").primaryKey(),
    windowAt: time("window_at"),
    attempts: integer("attempts").notNull(),
  },
  (t) => [check("auth_attempts_positive", sql`${t.attempts} > 0`)],
);
export const authBootstrap = pgTable(
  "auth_bootstrap",
  {
    singleton: boolean("singleton").primaryKey().default(true),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
  },
  (t) => [check("auth_bootstrap_singleton", sql`${t.singleton}`)],
);
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    targetId: uuid("target_id"),
    resultCode: text("result_code").notNull(),
    requestId: text("request_id").notNull(),
    beforeDigest: text("before_digest"),
    afterDigest: text("after_digest"),
    policyVersion: integer("policy_version").notNull().default(1),
    occurredAt: time("occurred_at"),
    previousDigest: text("previous_digest").notNull(),
    eventDigest: text("event_digest").notNull().unique(),
    sequence: bigint("sequence", { mode: "bigint" })
      .generatedAlwaysAsIdentity()
      .unique(),
  },
  (t) => [
    index("audit_events_time").on(t.sequence.desc()),
    index("audit_events_actor").on(t.actorId, t.sequence.desc()),
  ],
);
