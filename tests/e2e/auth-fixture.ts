import { test as base, expect } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
const requireApi = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
export interface BrowserAccount {
  id: string;
  login: string;
  password: string;
  secret: string;
  schema: string;
}
export function account(role = "Administrator"): BrowserAccount {
  return JSON.parse(
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        "--conditions=source",
        "scripts/auth-test-seed.ts",
        "--account",
        role,
      ],
      {
        env: { ...process.env, NODE_ENV: "test" },
        encoding: "utf8",
        shell: process.platform === "win32",
      },
    ),
  );
}
export function codeFor(secret: string): string {
  const { TOTP, Secret } = requireApi("otpauth");
  return new TOTP({ secret: Secret.fromBase32(secret) }).generate();
}
export async function authenticate(
  context: BrowserContext,
  user: BrowserAccount,
) {
  const origin = "http://127.0.0.1:4173";
  const csrf = await context.request.get(origin + "/api/v1/auth/csrf");
  expect(csrf.ok()).toBe(true);
  const password = await context.request.post(origin + "/api/v1/auth/login", {
    headers: { origin, "x-csrf-token": (await csrf.json()).csrf },
    data: { login: user.login, password: user.password },
  });
  expect(password.ok()).toBe(true);
  const mfa = await context.request.post(origin + "/api/v1/auth/mfa/verify", {
    headers: { origin, "x-csrf-token": (await password.json()).csrf },
    data: { code: codeFor(user.secret) },
  });
  expect(mfa.ok()).toBe(true);
}
export const test = base.extend({
  page: async ({ page, context }, use) => {
    if (existsSync("apps/api/src/auth/service.ts"))
      await authenticate(context, account());
    await use(page);
  },
});
export { expect };
