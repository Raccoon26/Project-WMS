import { it, expect } from "vitest";
import { authFixture } from "../auth-helper";
import { child, freePort, testUrl } from "../helpers";
it("S23: actual API process restart preserves valid sessions and durable revocations", async () => {
  const f = await authFixture();
  let running: ReturnType<typeof child> | undefined;
  try {
    await f.login();
    const originalCookie = f.cookie,
      port = await freePort();
    const env = {
      NODE_ENV: "test",
      DATABASE_URL: testUrl(),
      DB_SCHEMA: f.schema,
      API_PORT: String(port),
      AUTH_ENCRYPTION_KEY: f.key.toString("base64"),
      AUTH_ORIGIN: f.origin,
      DB_TIMEOUT_MS: "1000",
    };
    running = child("apps/api/src/main.ts", env);
    await running.started();
    const url = `http://127.0.0.1:${port}/api/v1/auth/me`;
    expect(
      (await fetch(url, { headers: { cookie: originalCookie } })).status,
    ).toBe(200);
    expect((await running.stop("SIGTERM")).code).toBe(0);
    expect(running.output).not.toContain(f.password);
    expect(running.output).not.toContain(f.key.toString("base64"));
    running = child("apps/api/src/main.ts", env);
    await running.started();
    expect(
      (await fetch(url, { headers: { cookie: originalCookie } })).status,
    ).toBe(200);
    await f.request("auth/logout", {});
    expect(
      (await fetch(url, { headers: { cookie: originalCookie } })).status,
    ).toBe(401);
    expect((await running.stop("SIGINT")).code).toBe(0);
  } finally {
    running?.dispose();
    await f.cleanup();
  }
}, 30000);
