import { registerInventory } from "./inventory/routes.js";
import { registerCatalog } from "./catalog/routes.js";
import { CatalogError } from "./catalog/service.js";
import { registerAuth } from "./auth/routes.js";
import type { AuthOptions } from "./auth/routes.js";
import { AuthError } from "./auth/service.js";
import Fastify from "fastify";
import { apiError, utcNow } from "@wms/contracts";
import type { DatabaseProbe } from "@wms/contracts";
import { requestId } from "@wms/runtime";
import type { Logger } from "@wms/runtime";
export function buildApi(db: DatabaseProbe, log: Logger, auth?: AuthOptions) {
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
    logger: false,
    requestIdHeader: false,
    genReqId: (req) => requestId(req.headers["x-request-id"]),
    bodyLimit: 16384,
    requestTimeout: 5000,
    connectionTimeout: 5000,
    keepAliveTimeout: 5000,
    forceCloseConnections: "idle",
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("x-request-id", req.id)
      .header("x-correlation-id", req.id)
      .header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff");
  });
  app.addHook("onResponse", async (req, reply) => {
    log.info("request_completed", {
      requestId: req.id,
      correlationId: req.id,
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
      result: reply.statusCode < 400 ? "success" : "failure",
    });
  });
  app.setErrorHandler((err, req, reply) => {
    if (
      err instanceof Error &&
      ["INVALID_INPUT", "RATE_LIMITED"].includes(err.message)
    )
      return void reply
        .code(err.message === "INVALID_INPUT" ? 400 : 429)
        .send(
          apiError(err.message as "INVALID_INPUT" | "RATE_LIMITED", req.id),
        );
    if (err instanceof CatalogError)
      return void reply.code(err.status).send(apiError(err.code, req.id));
    if (err instanceof AuthError) {
      log.error("authentication_rejected", {
        requestId: req.id,
        code: err.code,
      });
      return void reply.code(err.status).send(apiError(err.code, req.id));
    }
    if (
      auth &&
      err instanceof Error &&
      err.message === "Cannot use a pool after calling end on the pool"
    )
      return void reply.code(503).send(apiError("SERVICE_UNAVAILABLE", req.id));
    if (
      auth &&
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      /^(08|22|23|25|40|53|57|58|ECONN|ETIMEDOUT)/.test(String(err.code))
    )
      return void reply.code(503).send(apiError("SERVICE_UNAVAILABLE", req.id));
    if (
      auth &&
      req.url.startsWith("/api/v1/auth/") &&
      !(err as { validation?: unknown }).validation &&
      ![400, 413, 415].includes(
        (err as { statusCode?: number }).statusCode ?? 0,
      )
    )
      return void reply.code(503).send(apiError("SERVICE_UNAVAILABLE", req.id));
    const failure = err as { validation?: unknown; statusCode?: number };
    const invalid =
      !!failure.validation ||
      failure.statusCode === 400 ||
      failure.statusCode === 413 ||
      failure.statusCode === 415;
    const code = invalid ? "INVALID_INPUT" : "INTERNAL_ERROR";
    log.error("request_failed", {
      requestId: req.id,
      correlationId: req.id,
      code,
    });
    const status =
      failure.statusCode === 413
        ? 413
        : failure.statusCode === 415
          ? 415
          : invalid
            ? 400
            : 500;
    void reply.code(status).send(apiError(code, req.id));
  });
  app.setNotFoundHandler((req, reply) =>
    reply.code(404).send(apiError("NOT_FOUND", req.id)),
  );
  app.get(
    "/api/v1/health/live",
    {
      schema: { querystring: { type: "object", additionalProperties: false } },
    },
    async () => ({ status: "ok", service: "api", checkedAt: utcNow() }),
  );
  app.get("/api/v1/health/ready", async (req, reply) => {
    let ready = false;
    try {
      ready = await db.check();
    } catch {
      /* never leak provider errors */
    }
    return ready
      ? { status: "ok", service: "api", checkedAt: utcNow() }
      : reply.code(503).send(apiError("SERVICE_UNAVAILABLE", req.id));
  });
  app.get("/api/v1/version", async () => ({
    name: "Project-WMS",
    version: "0.1.0",
    apiVersion: "v1",
  }));
  registerAuth(app, auth);
  registerCatalog(app, auth);
  registerInventory(app, auth);
  return app;
}
