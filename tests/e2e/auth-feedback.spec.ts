import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { createDatabase, testDatabaseUrl } from "@wms/db";
import { account } from "./auth-fixture";
test("durable login throttling gives Japanese Korean English retry guidance", async ({
  page,
}) => {
  const user = account();
  const db = createDatabase(testDatabaseUrl(process.env.TEST_DATABASE_URL), {
    schema: user.schema,
  });
  try {
    await db.pool.query(
      "INSERT INTO auth_attempts(bucket,attempts) VALUES($1,10)",
      [
        "login-account:" +
          createHash("sha256").update(user.login).digest("hex"),
      ],
    );
  } finally {
    await db.close();
  }
  await page.goto("/");
  await page.getByLabel("ログインID", { exact: true }).fill(user.login);
  await page.getByLabel("パスワード", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("試行回数の上限");
  await page.getByRole("combobox").selectOption("ko");
  await expect(page.getByRole("alert")).toContainText("시도 횟수");
  await page.getByRole("combobox").selectOption("en");
  await expect(page.getByRole("alert")).toContainText("Too many attempts");
  expect((await page.request.get("/api/v1/auth/me")).status()).toBe(401);
});
test("real password challenge resets credential fields and expires visibly without replaying requests", async ({
  page,
}) => {
  const user = account();
  await page.clock.install();
  await page.goto("/");
  await page.getByLabel("ログインID", { exact: true }).fill(user.login);
  await page.getByLabel("パスワード", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "多要素認証",
  );
  await expect(page.getByLabel("認証コード", { exact: true })).toHaveValue("");
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") writes++;
  });
  await page.clock.runFor(20);
  const before = writes;
  await page.clock.fastForward(300001);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン");
  await expect(page.getByRole("alert")).toContainText("有効期限");
  await expect(page.locator("nav")).toHaveCount(0);
  expect(writes).toBe(before);
  // Only the client deadline uses Playwright clock. Password and restricted
  // session came from real PostgreSQL/API; server expiry has separate DB tests.
});
