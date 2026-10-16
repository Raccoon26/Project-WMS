import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { account, codeFor, authenticate } from "./auth-fixture";
import type { BrowserAccount } from "./auth-fixture";
import { createDatabase, testDatabaseUrl } from "@wms/db";
async function login(page: Page, user: BrowserAccount, finish = true) {
  await page.goto("/");
  await page.getByLabel("ログインID", { exact: true }).fill(user.login);
  await page.getByLabel("パスワード", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  if (finish) {
    await page
      .getByLabel("認証コード", { exact: true })
      .fill(codeFor(user.secret));
    await page.getByRole("button", { name: "確認", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "運用の基盤を、確かに。",
    );
  }
}
async function fixtureQuery(
  user: BrowserAccount,
  sql: string,
  values: unknown[] = [],
) {
  const db = createDatabase(testDatabaseUrl(process.env.TEST_DATABASE_URL), {
    schema: user.schema,
    timeoutMs: 3000,
  });
  try {
    return await db.pool.query(sql, values);
  } finally {
    await db.close();
  }
}
test("Japanese login, incorrect credentials, keyboard focus and safe errors", async ({
  page,
}) => {
  const user = account();
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン");
  await page.getByLabel("ログインID", { exact: true }).focus();
  await page.keyboard.type(user.login);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("パスワード", { exact: true })).toBeFocused();
  await page.keyboard.type("incorrect");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("nav")).toHaveCount(0);
});
test("real password and MFA authenticate, cookie flags are secure for localhost and storage contains no token", async ({
  page,
  context,
}) => {
  const user = account();
  await login(page, user);
  const cookies = await context.cookies("http://127.0.0.1:4173/api/v1/auth/me");
  const session = cookies.find((c) => c.name === "wms_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Strict");
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  expect(storage).toEqual({ local: [], session: [] });
  const response = await page.request.get("/api/v1/auth/me");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect((await response.json()).login).toBe(user.login);
});
test("MFA failure blocks dashboard until a valid factor is supplied", async ({
  page,
}) => {
  const user = account();
  await login(page, user, false);
  await page.getByLabel("認証コード", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "確認", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("nav")).toHaveCount(0);
  await page
    .getByLabel("認証コード", { exact: true })
    .fill(codeFor(user.secret));
  await page.getByRole("button", { name: "確認", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "運用の基盤を、確かに。",
  );
});
test("real MFA enrollment displays recovery codes only once and enables session", async ({
  page,
}) => {
  const user = account("Unenrolled");
  await login(page, user, false);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "認証アプリの登録",
  );
  await page.getByRole("button", { name: "確認", exact: true }).click();
  const secret = await page.locator("main code").innerText();
  await page.getByLabel("認証コード", { exact: true }).fill(codeFor(secret));
  await page.getByRole("button", { name: "確認", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "復旧コード（一度だけ表示）" }),
  ).toBeVisible();
  const codes = (await page.locator("pre").innerText()).split("\n");
  expect(codes).toHaveLength(10);
  await page.getByRole("button", { name: "保存しました" }).click();
  await expect(page.locator("nav")).toBeVisible();
  await page.reload();
  await expect(page.locator("pre")).toHaveCount(0);
});
test("logout, back navigation and direct protected URLs cannot reveal account content", async ({
  page,
}) => {
  const user = account();
  await login(page, user);
  await page.goto("/settings");
  await expect(page.getByText(user.login, { exact: false })).toHaveCount(0);
  await page
    .getByRole("button", { name: "ログアウト", exact: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン");
  await page.goBack();
  await expect(page.locator("nav")).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン");
  await expect(page.getByText("Synthetic Administrator")).toHaveCount(0);
});
test("server-side session expiry returns browser to sign-in", async ({
  page,
}) => {
  const user = account();
  await login(page, user);
  await fixtureQuery(
    user,
    "UPDATE sessions SET idle_expires_at=now()-interval '1 second' WHERE user_id=$1",
    [user.id],
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン");
  expect((await page.request.get("/api/v1/users")).status()).toBe(401);
});
test("Viewer cannot see audit or user management and direct API is denied", async ({
  page,
}) => {
  const user = account("Viewer");
  await login(page, user);
  await expect(page.locator('nav a[href="/activity-logs"]')).toHaveCount(0);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "ユーザーと権限" }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/v1/users")).status()).toBe(403);
  expect((await page.request.get("/api/v1/audit-events")).status()).toBe(403);
  await page.goto("/activity-logs");
  await expect(
    page.getByRole("heading", { name: "監査記録", level: 2 }),
  ).toHaveCount(0);
});
test("Japanese Korean English login and invalid locale fallback", async ({
  page,
}) => {
  await page.goto("/?lang=unknown");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await page.getByRole("combobox").selectOption("ko");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("로그인");
  await page.getByRole("combobox").selectOption("en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await page.getByRole("combobox").selectOption("ja");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン");
});
test("offline clears identity, caches no sensitive API data and performs no queued writes", async ({
  page,
  context,
}) => {
  const user = account();
  await login(page, user);
  await page.goto("/settings");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.request.get("/api/v1/auth/me");
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("オフライン");
  await expect(page.getByText("Synthetic Administrator")).toHaveCount(0);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys())
      for (const request of await (await caches.open(key)).keys())
        urls.push(request.url);
    return urls;
  });
  expect(cached.some((url) => url.includes("/api/"))).toBe(false);
  await context.setOffline(false);
  await expect(page.locator("nav")).toBeVisible();
});
test("logout synchronizes across two browser tabs", async ({
  page,
  context,
}) => {
  const user = account();
  await login(page, user);
  const second = await context.newPage();
  await second.goto("/settings");
  await expect(second.locator("nav")).toBeVisible();
  await page
    .getByRole("button", { name: "ログアウト", exact: true })
    .first()
    .click();
  await expect(second.getByRole("heading", { level: 1 })).toHaveText(
    "ログイン",
  );
  await expect(second.locator("nav")).toHaveCount(0);
  await second.close();
});
test("revoked permissions refresh on foreground and API denies immediately", async ({
  page,
  context,
}) => {
  const user = account();
  await authenticate(context, user);
  await page.goto("/");
  await expect(page.locator('nav a[href="/activity-logs"]')).toBeVisible();
  await fixtureQuery(
    user,
    "UPDATE user_roles SET revoked_at=now() WHERE user_id=$1",
    [user.id],
  );
  expect((await page.request.get("/api/v1/users")).status()).toBe(403);
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(page.locator('nav a[href="/activity-logs"]')).toHaveCount(0);
});
test("stored display-name HTML is escaped and static CSP blocks inline script", async ({
  page,
  context,
}) => {
  const user = account();
  const payload = '<img src=x onerror="window.__xss=true">';
  await fixtureQuery(user, "UPDATE users SET display_name=$1 WHERE id=$2", [
    payload,
    user.id,
  ]);
  await authenticate(context, user);
  const response = await page.goto("/settings");
  expect(response?.headers()["content-security-policy"]).toContain(
    "script-src 'self'",
  );
  await expect(page.getByText(payload, { exact: false })).toBeVisible();
  expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  await expect(page.locator("main img")).toHaveCount(0);
});
