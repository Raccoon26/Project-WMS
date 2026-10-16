import { randomBytes } from "node:crypto";
import { logger } from "@wms/runtime";
import { buildApi } from "../apps/api/src/app";
import { AuthService } from "../apps/api/src/auth/service";
import { newTotp } from "../apps/api/src/auth/crypto";
import { scopedDatabase } from "./helpers";
export async function authFixture() {
  const scope = await scopedDatabase(3000);
  await scope.db.migrate();
  const key = randomBytes(32),
    origin = "http://127.0.0.1:5173",
    password = randomBytes(24).toString("base64url");
  const logs: string[] = [];
  const app = buildApi(
    scope.db,
    logger("api", (line) => logs.push(line)),
    { pool: scope.db.pool, key: key.toString("base64"), origin },
  );
  const service = new AuthService(scope.db.pool, key, origin),
    otp = newTotp("administrator");
  const bootstrap = await service.bootstrap(
    "administrator",
    password,
    "Synthetic Administrator",
    otp.secret.base32,
    otp.generate({ timestamp: Date.now() - 30000 }),
  );
  let cookie = "",
    csrf = "";
  async function request(
    path: string,
    body?: unknown,
    method = "POST",
    extra: Record<string, string> = {},
  ) {
    const r = await app.inject({
      url: "/api/v1/" + path,
      method: body === undefined ? "GET" : (method as "POST"),
      headers: { cookie, origin, "x-csrf-token": csrf, ...extra },
      ...(body === undefined
        ? {}
        : { payload: body as Record<string, unknown> }),
    });
    const set = r.headers["set-cookie"];
    if (set) cookie = String(set).split(";")[0]!;
    if (r.json().csrf) csrf = r.json().csrf;
    return r;
  }
  async function login() {
    await request("auth/csrf");
    const r = await request("auth/login", {
      login: " ADMINISTRATOR ",
      password,
    });
    if (r.statusCode !== 200) throw new Error("LOGIN_SETUP_FAILED");
    return request("auth/mfa/verify", { code: otp.generate() });
  }
  return {
    ...scope,
    app,
    service,
    key,
    password,
    origin,
    otp,
    bootstrap,
    logs,
    request,
    login,
    get cookie() {
      return cookie;
    },
    get csrf() {
      return csrf;
    },
    async cleanup() {
      await app.close();
      await scope.cleanup();
    },
  };
}
