import { ConfigError } from "@wms/runtime";
import type { Permission } from "./policy.js";
declare module "fastify" {
  interface FastifyContextConfig {
    wmsPermission?: Permission;
    wmsRecentReauth?: boolean;
  }
}
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { AuthService, AuthError } from "./service.js";
import type { Context, Issued } from "./service.js";
import { encryptionKey } from "./crypto.js";
export interface AuthOptions {
  pool: Pool;
  key: string;
  origin: string;
}
export function authOptions(
  pool: Pool,
  env: NodeJS.ProcessEnv,
): AuthOptions | undefined {
  if (!env.AUTH_ENCRYPTION_KEY && !env.AUTH_ORIGIN) return undefined;
  try {
    encryptionKey(env.AUTH_ENCRYPTION_KEY);
  } catch {
    throw new ConfigError("AUTH_ENCRYPTION_KEY");
  }
  let u: URL;
  try {
    u = new URL(env.AUTH_ORIGIN ?? "");
  } catch {
    throw new ConfigError("AUTH_ORIGIN");
  }
  if (
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    !["http:", "https:"].includes(u.protocol) ||
    u.origin !== env.AUTH_ORIGIN
  )
    throw new ConfigError(
      "AUTH_ORIGIN (exact loopback browser origin required)",
    );
  return { pool, key: env.AUTH_ENCRYPTION_KEY!, origin: u.origin };
}
export function registerAuth(
  app: FastifyInstance,
  options: AuthOptions | undefined,
) {
  const service = options
    ? new AuthService(options.pool, encryptionKey(options.key), options.origin)
    : undefined;
  const cookie = "wms_session";
  function ctx(req: FastifyRequest): Context {
    const raw = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookie + "="))
      ?.slice(cookie.length + 1);
    return {
      ...(raw ? { token: raw } : {}),
      ...(typeof req.headers["x-csrf-token"] === "string"
        ? { csrf: req.headers["x-csrf-token"] }
        : {}),
      ...(req.headers.origin ? { origin: req.headers.origin } : {}),
      ip: req.ip,
      requestId: req.id,
    };
  }
  const registered = new Set([
    "GET /api/v1/auth/csrf",
    "GET /api/v1/auth/me",
    "POST /api/v1/auth/login",
    "POST /api/v1/auth/logout",
    "POST /api/v1/auth/reauth",
    "POST /api/v1/auth/mfa/verify",
    "POST /api/v1/auth/mfa/enroll",
    "POST /api/v1/auth/mfa/confirm",
    "POST /api/v1/auth/mfa/recovery",
    "POST /api/v1/auth/mfa/disable",
    "POST /api/v1/auth/password",
    "POST /api/v1/auth/sessions/revoke",
    "GET /api/v1/users",
    "POST /api/v1/users",
    "PATCH /api/v1/users/:id",
    "PUT /api/v1/users/:id/roles",
    "GET /api/v1/roles",
    "GET /api/v1/audit-events",
  ]);
  app.addHook("onRequest", async (req) => {
    const path = req.url.split("?")[0]!;
    const method = req.method === "HEAD" ? "GET" : req.method;
    if (
      method === "GET" &&
      [
        "/api/v1/health/live",
        "/api/v1/health/ready",
        "/api/v1/version",
      ].includes(path)
    )
      return;
    const matched = req.routeOptions.url;
    if (service && path.startsWith("/api/"))
      await service.rate("http-ip", req.ip, 600, 60);
    if (registered.has(method + " " + matched)) {
      if (!service) throw new AuthError("SERVICE_UNAVAILABLE", 503);
      return; // Every existing auth handler performs its own transactional policy.
    }
    if (req.routeOptions.config.wmsPermission) {
      if (!service) throw new AuthError("SERVICE_UNAVAILABLE", 503);
      await service.authorize(
        ctx(req),
        req.routeOptions.config.wmsPermission,
        method !== "GET",
        req.routeOptions.config.wmsRecentReauth ?? false,
      );
      return;
    }
    if (matched?.startsWith("/api/")) throw new AuthError("UNAUTHORIZED", 401);
  });
  app.addHook("onError", async (req, _reply, error) => {
    if (
      service &&
      error instanceof AuthError &&
      [401, 403, 429].includes(error.status)
    )
      await service.recordDenied(ctx(req), error.code);
  });
  const object = (
    properties: Record<string, unknown>,
    required: string[] = Object.keys(properties),
  ) => ({ type: "object", properties, required, additionalProperties: false });
  const string = (maxLength = 128, minLength = 1) => ({
    type: "string",
    minLength,
    maxLength,
  });
  const code = string(128);
  const password = string(128, 14);
  const uuid = {
    type: "string",
    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
  };
  const issue = (reply: import("fastify").FastifyReply, issued: Issued) => {
    reply.header(
      "set-cookie",
      `${cookie}=${issued.token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=43200${options?.origin.startsWith("https:") ? "; Secure" : ""}`,
    );
    return { csrf: issued.csrf, stage: issued.stage };
  };
  app.get("/api/v1/auth/csrf", async (req, reply) => {
    const result = await service!.csrfSession(ctx(req));
    if (result.issued) issue(reply, result.issued);
    return { csrf: result.csrf };
  });
  app.post<{ Body: { login: string; password: string } }>(
    "/api/v1/auth/login",
    { schema: { body: object({ login: string(64), password: string(128) }) } },
    async (req, reply) =>
      issue(
        reply,
        await service!.login(ctx(req), req.body.login, req.body.password),
      ),
  );
  app.post<{ Body: { code: string; recovery?: boolean } }>(
    "/api/v1/auth/mfa/verify",
    {
      schema: {
        body: object({ code, recovery: { type: "boolean" } }, ["code"]),
      },
    },
    async (req, reply) =>
      issue(
        reply,
        await service!.verifyMfa(ctx(req), req.body.code, req.body.recovery),
      ),
  );
  app.get("/api/v1/auth/me", async (req) => service!.me(ctx(req)));
  app.post(
    "/api/v1/auth/logout",
    { schema: { body: object({}) } },
    async (req, reply) => {
      await service!.logout(ctx(req));
      reply.header(
        "set-cookie",
        `${cookie}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0`,
      );
      return { ok: true };
    },
  );
  app.post<{ Body: { password: string; code: string } }>(
    "/api/v1/auth/reauth",
    { schema: { body: object({ password: string(128), code }) } },
    async (req, reply) =>
      issue(
        reply,
        await service!.reauth(ctx(req), req.body.password, req.body.code),
      ),
  );
  app.post(
    "/api/v1/auth/mfa/enroll",
    { schema: { body: object({}) } },
    async (req) => service!.enroll(ctx(req)),
  );
  app.post<{ Body: { code: string } }>(
    "/api/v1/auth/mfa/confirm",
    { schema: { body: object({ code }) } },
    async (req, reply) => {
      const result = await service!.confirm(ctx(req), req.body.code);
      return { ...issue(reply, result.issued), codes: result.codes };
    },
  );
  app.post(
    "/api/v1/auth/mfa/recovery",
    { schema: { body: object({}) } },
    async (req) => service!.regenerateCodes(ctx(req)),
  );
  app.post(
    "/api/v1/auth/mfa/disable",
    { schema: { body: object({}) } },
    async (req) => {
      await service!.disableMfa(ctx(req));
      return { ok: true };
    },
  );
  app.post<{ Body: { password: string } }>(
    "/api/v1/auth/password",
    { schema: { body: object({ password }) } },
    async (req) => {
      await service!.changePassword(ctx(req), req.body.password);
      return { ok: true };
    },
  );
  app.post(
    "/api/v1/auth/sessions/revoke",
    { schema: { body: object({}) } },
    async (req) => {
      await service!.revokeSessions(ctx(req));
      return { ok: true };
    },
  );
  for (const [path, kind] of [
    ["users", "users"],
    ["roles", "roles"],
    ["audit-events", "audit"],
  ] as const)
    app.get<{ Querystring: { limit?: string; cursor?: string } }>(
      `/api/v1/${path}`,
      {
        schema: {
          querystring: object(
            {
              limit: { type: "string", pattern: "^([1-9]|[1-9][0-9]|100)$" },
              cursor:
                kind === "audit"
                  ? { type: "string", pattern: "^[0-9]{1,18}$" }
                  : uuid,
            },
            [],
          ),
        },
      },
      async (req) =>
        service!.list(
          ctx(req),
          kind,
          Number(req.query.limit ?? 25),
          req.query.cursor,
        ),
    );
  app.post<{
    Body: {
      login: string;
      password: string;
      displayName: string;
      locale: string;
    };
  }>(
    "/api/v1/users",
    {
      schema: {
        body: object({
          login: string(64),
          password,
          displayName: string(100),
          locale: { enum: ["ja", "ko", "en"] },
        }),
      },
    },
    async (req) => service!.createUser(ctx(req), req.body),
  );
  app.patch<{
    Params: { id: string };
    Body: { status?: string; displayName?: string; locale?: string };
  }>(
    "/api/v1/users/:id",
    {
      schema: {
        params: object({ id: uuid }),
        body: {
          ...object(
            {
              status: { enum: ["active", "inactive", "locked"] },
              displayName: string(100),
              locale: { enum: ["ja", "ko", "en"] },
            },
            [],
          ),
          minProperties: 1,
        },
      },
    },
    async (req) => service!.updateUser(ctx(req), req.params.id, req.body),
  );
  app.put<{ Params: { id: string }; Body: { roles: string[] } }>(
    "/api/v1/users/:id/roles",
    {
      schema: {
        params: object({ id: uuid }),
        body: object({
          roles: {
            type: "array",
            maxItems: 5,
            uniqueItems: true,
            items: {
              enum: [
                "Administrator",
                "Manager",
                "Operator",
                "Viewer",
                "Auditor",
              ],
            },
          },
        }),
      },
    },
    async (req) => service!.setRoles(ctx(req), req.params.id, req.body.roles),
  );
  return service;
}
