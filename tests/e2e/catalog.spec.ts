import { test, expect } from "@playwright/test";
import type { Page, BrowserContext, APIRequestContext } from "@playwright/test";
import { account, authenticate, codeFor } from "./auth-fixture";
import type { BrowserAccount } from "./auth-fixture";
import { createDatabase, testDatabaseUrl } from "@wms/db";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { seedCatalog } from "../../scripts/catalog-fixture";
const origin = "http://127.0.0.1:4173";
async function sql(
  user: BrowserAccount,
  query: string,
  values: unknown[] = [],
) {
  const db = createDatabase(testDatabaseUrl(process.env.TEST_DATABASE_URL), {
    schema: user.schema,
    timeoutMs: 3000,
  });
  try {
    return await db.pool.query(query, values);
  } finally {
    await db.close();
  }
}
// Isolate unrelated browser scenarios at their boundary, never inside the brute-force test.
// The production thresholds and all existing auth attack assertions are unchanged.
test.beforeEach(async () => {
  const state = JSON.parse(readFileSync(".runtime/auth-fixture.json", "utf8"));
  await sql(
    { schema: state.schema } as BrowserAccount,
    "DELETE FROM auth_attempts",
  );
});
async function write(
  request: APIRequestContext,
  path: string,
  body: unknown,
  method = "POST",
  key = randomUUID(),
) {
  const csrf = await request.get(origin + "/api/v1/auth/csrf");
  expect(csrf.ok()).toBe(true);
  const r = await request.fetch(origin + "/api/v1/" + path, {
    method,
    headers: {
      origin,
      "x-csrf-token": (await csrf.json()).csrf,
      "idempotency-key": key,
    },
    data: body,
  });
  return r;
}
async function setup(
  page: Page,
  context: BrowserContext,
  role = "Administrator",
) {
  const user = account(role);
  await authenticate(context, user);
  await page.goto("/products");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("商品");
  return user;
}
const panel = (page: Page) => page.locator("section.catalog").first();
async function createProduct(page: Page, name: string) {
  const p = panel(page);
  await p.getByRole("button", { name: "新規登録", exact: true }).click();
  await p.getByLabel("商品名（日本語）", { exact: true }).fill(name);
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("サーバーに保存しました");
  await find(page, name);
}
async function find(page: Page, name: string) {
  const p = panel(page);
  await p.getByLabel("検索", { exact: true }).fill(name);
  await p.getByRole("button", { name: "検索", exact: true }).click();
  await expect(p.getByRole("cell", { name, exact: true })).toBeVisible();
}
test("catalog browser: real login MFA product create edit state and persisted XSS-safe metadata", async ({
  page,
  context,
}) => {
  const user = account();
  await page.goto("/products");
  await page.getByLabel("ログインID", { exact: true }).fill(user.login);
  await page.getByLabel("パスワード", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page
    .getByLabel("認証コード", { exact: true })
    .fill(codeFor(user.secret));
  await page.getByRole("button", { name: "確認", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("商品");
  const name = "Synthetic-" + randomUUID();
  await createProduct(page, name);
  const p = panel(page);
  await p
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "詳細・編集", exact: true })
    .click();
  const html = "<img src=x onerror=window.__catalogXss=true> " + randomUUID();
  await p.getByLabel("商品名（日本語）", { exact: true }).fill(html);
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await find(page, html);
  expect(
    await page.evaluate(() => Reflect.get(window, "__catalogXss")),
  ).toBeUndefined();
  const row = p.getByRole("row").filter({ hasText: html });
  await row.getByRole("button", { name: "詳細・編集", exact: true }).click();
  await p
    .locator(".catalog-editor")
    .getByRole("combobox", { name: "状態", exact: true })
    .selectOption("inactive");
  page.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(row).toContainText("無効");
  expect(
    (await sql(user, "SELECT status FROM products WHERE name_ja=$1", [html]))
      .rows[0].status,
  ).toBe("inactive");
  const r = await context.request.get("/api/v1/products");
  expect(r.headers()["cache-control"]).toBe("no-store");
});
test("catalog browser: SKU create edit normalized duplicate barcode conflict and mapping history", async ({
  page,
  context,
}) => {
  await setup(page, context);
  const name = "SKU-product-" + randomUUID();
  await createProduct(page, name);
  const p = panel(page);
  await p
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "SKU", exact: true })
    .click();
  const code = "SKU-" + randomUUID().slice(0, 8).toUpperCase();
  const editedBarcode = String(
    BigInt("0x" + randomUUID().replaceAll("-", "").slice(0, 10)),
  ).padStart(13, "1");
  await p.getByRole("button", { name: "新規登録", exact: true }).click();
  await p.getByLabel("コード", { exact: true }).fill(code);
  await p.getByLabel("バーコード", { exact: true }).fill(String(Date.now()));
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(p.getByRole("row").filter({ hasText: code })).toBeVisible();
  const sku = (
    await (await context.request.get("/api/v1/skus?q=" + code)).json()
  ).items[0];
  await p
    .getByRole("row")
    .filter({ hasText: code })
    .getByRole("button", { name: "詳細・編集", exact: true })
    .click();
  await p.getByLabel("バーコード", { exact: true }).fill(editedBarcode);
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("保存");
  await p.getByRole("button", { name: "新規登録", exact: true }).click();
  await p.getByLabel("コード", { exact: true }).fill(code.toLowerCase());
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("競合");
  await p.getByLabel("コード", { exact: true }).fill(code + "-B");
  await p.getByLabel("バーコード", { exact: true }).fill(editedBarcode);
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("競合");
  page.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "キャンセル", exact: true }).click();
  const a = await write(context.request, "integration-accounts", {
    provider: "amazon",
    account_ref: randomUUID(),
    name: "Synthetic account",
  });
  expect(a.ok()).toBe(true);
  const acc = await a.json();
  await p
    .getByRole("row")
    .filter({ hasText: code })
    .getByRole("button", { name: "外部コード", exact: true })
    .click();
  await p.getByRole("button", { name: "新規登録", exact: true }).click();
  await p
    .locator(".catalog-editor")
    .getByRole("textbox", { name: "連携アカウントID", exact: true })
    .fill(acc.id);
  await p
    .getByLabel("外部コード", { exact: true })
    .fill("Synthetic-External-" + code);
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    p.getByRole("cell", { name: "Synthetic-External-" + code, exact: true }),
  ).toHaveCount(2);
  const mappings = await context.request.get(
    "/api/v1/skus/" + sku.id + "/mappings",
  );
  const mapping = (await mappings.json()).items[0];
  expect(mapping.trust).toBe("unverified");
  expect(
    (
      await write(context.request, "skus/" + sku.id + "/mappings", {
        account_id: acc.id,
        provider: "amazon",
        marketplace: "JP",
        external_code: mapping.external_code,
      })
    ).status(),
  ).toBe(409);
  await p
    .getByRole("button", { name: "変更履歴", exact: true })
    .first()
    .click();
  await expect(p.getByRole("region", { name: "変更履歴" })).toContainText(
    "バージョン 1",
  );
});
test("catalog browser: warehouse and location creation hierarchy editing and inactivity", async ({
  page,
  context,
}) => {
  const user = await setup(page, context);
  await page.goto("/warehouses");
  const p = panel(page),
    code = "WH-" + randomUUID().slice(0, 8).toUpperCase();
  await p.getByRole("button", { name: "新規登録", exact: true }).click();
  await p.getByLabel("コード", { exact: true }).fill(code);
  await p.getByLabel("名称", { exact: true }).fill("Synthetic warehouse");
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await find(page, code);
  const row = p.getByRole("row").filter({ hasText: code });
  await row.getByRole("button", { name: "詳細・編集", exact: true }).click();
  await p.getByLabel("名称", { exact: true }).fill("Edited warehouse");
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(row).toContainText("Edited warehouse");
  await row.getByRole("button", { name: "ロケーション", exact: true }).click();
  for (const [location, name] of [
    ["ZONE", "Zone"],
    ["SHELF", "Shelf"],
  ]) {
    await p.getByRole("button", { name: "新規登録", exact: true }).click();
    await p.getByLabel("コード", { exact: true }).fill(location!);
    await p.getByLabel("名称", { exact: true }).fill(name!);
    if (location === "SHELF")
      await p
        .getByRole("combobox", { name: "親ロケーションID", exact: true })
        .selectOption({ label: "Zone" });
    await p.getByRole("button", { name: "保存", exact: true }).click();
    await expect(
      p.getByRole("cell", { name: location!, exact: true }),
    ).toBeVisible();
  }
  const rows = (
    await sql(
      user,
      "SELECT l.code,l.parent_id FROM locations l JOIN warehouses w ON w.id=l.warehouse_id WHERE w.code=$1",
      [code],
    )
  ).rows;
  expect(rows.find((r) => r.code === "SHELF").parent_id).toBeTruthy();
  await page.goto("/warehouses");
  await find(page, code);
  await panel(page)
    .getByRole("button", { name: "詳細・編集", exact: true })
    .click();
  await panel(page)
    .locator(".catalog-editor")
    .getByRole("combobox", { name: "状態", exact: true })
    .selectOption("inactive");
  page.once("dialog", (d) => d.accept());
  await panel(page).getByRole("button", { name: "保存", exact: true }).click();
  await expect(panel(page).getByRole("status")).toContainText("保存");
  await expect(panel(page)).toContainText("未計測");
});
test("catalog browser: sixty actual SKU search filter sort next page empty results and locale controls", async ({
  page,
  context,
}) => {
  const user = await setup(page, context);
  const db = createDatabase(testDatabaseUrl(process.env.TEST_DATABASE_URL), {
    schema: user.schema,
    timeoutMs: 3000,
  });
  // Each scenario shares a server schema. Use existing fixture once per complete run.
  try {
    if (
      !(await db.pool.query("SELECT 1 FROM skus WHERE code='TEST-SKU-0001'"))
        .rowCount
    )
      await seedCatalog(db, user.schema, user.id, 60);
  } finally {
    await db.close();
  }
  await panel(page)
    .getByRole("button", { name: "SKU", exact: true })
    .first()
    .click();
  const p = panel(page);
  await p.getByLabel("検索", { exact: true }).fill("TEST-SKU");
  await p.getByRole("button", { name: "検索", exact: true }).click();
  await p
    .getByRole("combobox", { name: "並び順", exact: true })
    .selectOption("code");
  await expect(p.locator("tbody tr")).toHaveCount(25);
  await p
    .getByRole("button", { name: "次のページ", exact: true })
    .last()
    .click();
  await expect(
    p.getByRole("cell", { name: "TEST-SKU-0026", exact: true }),
  ).toBeVisible();
  await p
    .getByRole("button", { name: "次のページ", exact: true })
    .last()
    .click();
  await expect(p.locator("tbody tr")).toHaveCount(10);
  await p
    .getByRole("combobox", { name: "状態", exact: true })
    .selectOption("inactive");
  await expect(p.locator("tbody tr")).toHaveCount(3);
  await p.getByLabel("検索", { exact: true }).fill("nothing-matches");
  await p.getByRole("button", { name: "検索", exact: true }).click();
  await expect(p).toContainText("該当するデータはありません");
  await page.locator("select").first().selectOption("ko");
  await expect(p).toContainText("검색 결과가 없습니다");
  await page.locator("select").first().selectOption("en");
  await expect(p).toContainText("No matching records");
});
test("catalog browser: Viewer has reads but no write controls and direct API mutations fail", async ({
  page,
  context,
}) => {
  await setup(page, context, "Viewer");
  const p = panel(page);
  await expect(
    p.getByRole("button", { name: "新規登録", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await write(context.request, "products", { name_ja: "Escalation" })
    ).status(),
  ).toBe(403);
  await page.goto("/warehouses");
  await expect(
    panel(page).getByRole("button", { name: "新規登録", exact: true }),
  ).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "倉庫別権限" })).toHaveCount(
    0,
  );
});
test("catalog browser: warehouse A scope SQL filtering and revocation update existing UI and session", async ({
  context,
  browser,
}) => {
  const admin = account();
  await authenticate(context, admin);
  const a = await (
      await write(context.request, "warehouses", {
        code: "A-" + randomUUID().slice(0, 8).toUpperCase(),
        name: "Private A",
        type: "internal",
      })
    ).json(),
    b = await (
      await write(context.request, "warehouses", {
        code: "B-" + randomUUID().slice(0, 8).toUpperCase(),
        name: "Private B",
        type: "fba",
      })
    ).json();
  const user = account("Viewer");
  expect(
    (
      await write(
        context.request,
        "users/" + user.id + "/roles",
        { roles: [] },
        "PUT",
      )
    ).ok(),
  ).toBe(true);
  expect(
    (
      await write(
        context.request,
        "users/" + user.id + "/warehouse-roles",
        { warehouse_id: a.id, roles: ["Manager"] },
        "PUT",
      )
    ).ok(),
  ).toBe(true);
  const scoped = await browser.newContext();
  try {
    await authenticate(scoped, user);
    const p = await scoped.newPage();
    await p.goto("/warehouses");
    await expect(
      panel(p).getByRole("cell", { name: "Private A", exact: true }),
    ).toBeVisible();
    await expect(
      panel(p).getByRole("cell", { name: "Private B", exact: true }),
    ).toHaveCount(0);
    expect(
      (await scoped.request.get("/api/v1/warehouses/" + b.id)).status(),
    ).toBe(403);
    expect(
      (
        await write(
          context.request,
          "users/" + user.id + "/warehouse-roles",
          { warehouse_id: a.id, roles: [] },
          "PUT",
        )
      ).ok(),
    ).toBe(true);
    await p.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(
      p.getByRole("heading", { name: "この画面の閲覧権限がありません。" }),
    ).toBeVisible();
    expect(
      (await scoped.request.get("/api/v1/warehouses/" + a.id)).status(),
    ).toBe(403);
  } finally {
    await scoped.close();
  }
});
test("catalog browser: stale edit conflicts and a lost save response retains form and recovers one result", async ({
  page,
  context,
}) => {
  await setup(page, context);
  const name = "Conflict-" + randomUUID();
  await createProduct(page, name);
  const p = panel(page);
  await p
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "詳細・編集", exact: true })
    .click();
  const row = (
    await (await context.request.get("/api/v1/products?q=" + name)).json()
  ).items[0];
  expect(
    (
      await write(
        context.request,
        "products/" + row.id,
        { version: row.version, name_ja: name + "-server" },
        "PATCH",
      )
    ).ok(),
  ).toBe(true);
  await p
    .getByLabel("商品名（日本語）", { exact: true })
    .fill(name + "-browser");
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("競合");
  await expect(p.getByLabel("商品名（日本語）", { exact: true })).toHaveValue(
    name + "-browser",
  );
  page.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "キャンセル", exact: true }).click();
  await p.getByRole("button", { name: "新規登録", exact: true }).click();
  const lost = "Lost-" + randomUUID();
  await p.getByLabel("商品名（日本語）", { exact: true }).fill(lost);
  await page.route("**/api/v1/products", async (route) => {
    if (route.request().method() === "POST") {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("入力内容は保持");
  await expect(p.getByLabel("商品名（日本語）", { exact: true })).toHaveValue(
    lost,
  );
  await page.unroute("**/api/v1/products");
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("保存しました");
  expect(
    (await (await context.request.get("/api/v1/products?q=" + lost)).json())
      .items,
  ).toHaveLength(1);
});
test("catalog browser: offline clears data, API cache remains empty and logout cannot revive delayed catalog results", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await createProduct(page, "Logout-" + randomUUID());
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    Reflect.set(window, "__releaseCatalog", null);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await original(...args);
      if (String(args[0]).startsWith("/api/v1/products?"))
        await new Promise<void>((resolve) =>
          Reflect.set(window, "__releaseCatalog", resolve),
        );
      return response;
    };
  });
  await panel(page)
    .getByRole("button", { name: "再取得", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => typeof Reflect.get(window, "__releaseCatalog")),
    )
    .toBe("function");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.evaluate(() => Reflect.get(window, "__releaseCatalog")?.());
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン");
  await expect(page.locator("section.catalog")).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByRole("status")).toHaveText(
    "オフラインです。認証と業務操作は利用できません。",
  );
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys())
      urls.push(...(await (await caches.open(key)).keys()).map((r) => r.url));
    return urls.filter((u) => u.includes("/api/"));
  });
  expect(cached).toEqual([]);
  await context.setOffline(false);
});
test("catalog browser: real settings warehouse grant and revoke retain independent Global roles", async ({
  page,
  context,
}) => {
  const admin = await setup(page, context),
    target = account("Viewer");
  const w = await (
    await write(context.request, "warehouses", {
      code: "GRANT-" + randomUUID().slice(0, 8).toUpperCase(),
      name: "Grant warehouse " + randomUUID(),
      type: "external_email",
    })
  ).json();
  await page.goto("/settings");
  const scopes = page.locator("section.catalog");
  await scopes
    .getByRole("textbox", { name: "ユーザー 検索", exact: true })
    .fill(target.login);
  await scopes
    .getByRole("combobox", { name: "ユーザー", exact: true })
    .selectOption({ label: target.login });
  await scopes
    .getByRole("textbox", { name: "対象倉庫 検索", exact: true })
    .fill(w.code);
  await scopes
    .getByRole("combobox", { name: "対象倉庫", exact: true })
    .selectOption({ label: w.name });
  await scopes.getByRole("checkbox", { name: "Manager", exact: true }).check();
  await scopes.getByRole("button", { name: "権限を保存", exact: true }).click();
  await expect(scopes.getByRole("status")).toContainText("保存");
  expect(
    (
      await sql(
        admin,
        "SELECT scope,warehouse_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND r.code='Manager' AND ur.revoked_at IS NULL",
        [target.id],
      )
    ).rows,
  ).toEqual([{ scope: "warehouse", warehouse_id: w.id }]);
  await scopes
    .getByRole("button", { name: "この倉庫の権限を回収", exact: true })
    .click();
  await expect
    .poll(async () =>
      Number(
        (
          await sql(
            admin,
            "SELECT count(*) FROM user_roles WHERE user_id=$1 AND warehouse_id=$2 AND revoked_at IS NULL",
            [target.id, w.id],
          )
        ).rows[0].count,
      ),
    )
    .toBe(0);
  expect(
    (
      await sql(
        admin,
        "SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND ur.scope='global' AND ur.revoked_at IS NULL",
        [target.id],
      )
    ).rows.map((r) => r.code),
  ).toEqual(["Viewer"]);
});
test("catalog browser: account metadata UI and duplicate-submit guard use real server records", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page.goto("/integrations");
  const p = panel(page);
  await p.getByRole("button", { name: "新規登録", exact: true }).click();
  const ref = "synthetic-" + randomUUID(),
    name = "Synthetic metadata " + randomUUID();
  await p.getByLabel("非秘密のアカウント参照", { exact: true }).fill(ref);
  await p.getByLabel("名称", { exact: true }).fill(name);
  const original = await page.evaluate(() => {
    Reflect.set(window, "__countCatalogPosts", 0);
    const native = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      if (
        String(args[0]) === "/api/v1/integration-accounts" &&
        args[1]?.method === "POST"
      ) {
        Reflect.set(
          window,
          "__countCatalogPosts",
          Reflect.get(window, "__countCatalogPosts") + 1,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
      }
      return native(...args);
    };
    return true;
  });
  expect(original).toBe(true);
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "読み込み中", exact: true }),
  ).toBeDisabled();
  await p
    .locator(".catalog-editor")
    .evaluate((form) =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await expect(p.getByRole("status")).toContainText("保存しました");
  expect(
    await page.evaluate(() => Reflect.get(window, "__countCatalogPosts")),
  ).toBe(1);
  const rows = await context.request.get(
    "/api/v1/integration-accounts?q=" + ref,
  );
  expect((await rows.json()).items).toHaveLength(1);
});
test("catalog browser: unsaved input survives cancelled navigation and layout supports keyboard on mobile and desktop", async ({
  page,
  context,
  isMobile,
}) => {
  await setup(page, context);
  const p = panel(page);
  await p.getByRole("button", { name: "新規登録", exact: true }).click();
  const input = p.getByLabel("商品名（日本語）", { exact: true });
  await input.focus();
  await page.keyboard.type("Unsaved synthetic form");
  await expect(input).toBeFocused();
  if (isMobile)
    await page
      .getByRole("button", { name: "メニューを開く", exact: true })
      .click();
  page.once("dialog", (d) => d.dismiss());
  await page.locator('nav a[href="/inventory"]').click();
  if (isMobile)
    await page
      .getByRole("button", { name: "メニューを閉じる", exact: true })
      .first()
      .click();
  await expect(input).toHaveValue("Unsaved synthetic form");
  expect(new URL(page.url()).pathname).toBe("/products");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/catalog-" + (isMobile ? "mobile" : "desktop") + ".png",
    fullPage: true,
  });
  page.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(p.locator(".catalog-editor")).toHaveCount(0);
});
