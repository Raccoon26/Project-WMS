import { test, expect } from "@playwright/test";
import type { Page, BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDatabase, testDatabaseUrl } from "@wms/db";
import { account, authenticate } from "./auth-fixture";
const origin = "http://127.0.0.1:4173";
async function sql(query: string, values: unknown[] = []) {
  const state = JSON.parse(readFileSync(".runtime/auth-fixture.json", "utf8"));
  const db = createDatabase(testDatabaseUrl(process.env.TEST_DATABASE_URL), {
    schema: state.schema,
    timeoutMs: 3000,
  });
  try {
    return await db.pool.query(query, values);
  } finally {
    await db.close();
  }
}
test.beforeEach(async () => {
  await sql("DELETE FROM auth_attempts");
});
async function write(
  context: BrowserContext,
  path: string,
  data: unknown,
  key = randomUUID(),
) {
  const csrf = await context.request.get(origin + "/api/v1/auth/csrf");
  return context.request.post(origin + "/api/v1/" + path, {
    headers: {
      origin,
      "x-csrf-token": (await csrf.json()).csrf,
      "idempotency-key": key,
    },
    data,
  });
}
async function setup(page: Page, context: BrowserContext) {
  const user = account();
  await authenticate(context, user);
  const create = async (path: string, data: unknown) => {
    const r = await write(context, path, data);
    expect(r.ok()).toBe(true);
    return r.json();
  };
  const suffix = randomUUID().slice(0, 8);
  const product = await create("products", {
    name_ja: "Synthetic Ledger " + suffix,
  });
  const sku = await create("skus", {
    product_id: product.id,
    code: "LEDGER-" + suffix.toUpperCase(),
  });
  const a = await create("warehouses", {
      code: "A-" + suffix,
      name: "Synthetic A " + suffix,
      type: "internal",
    }),
    b = await create("warehouses", {
      code: "B-" + suffix,
      name: "Synthetic B " + suffix,
      type: "internal",
    });
  await page.goto("/inventory");
  return { user, sku, a, b };
}
const panel = (page: Page) => page.locator(".inventory-engine");
const form = (page: Page) => panel(page).locator("form.catalog-editor");
async function mode(page: Page, operation: string) {
  await form(page).getByRole("combobox").first().selectOption(operation);
}
async function chooseSku(page: Page, sku: { id: string; code: string }) {
  await form(page)
    .getByRole("textbox", { name: "SKUを検索 検索", exact: true })
    .fill(sku.code);
  const picker = form(page).getByRole("combobox", {
    name: "SKUを検索",
    exact: true,
  });
  await expect(picker.locator('option[value="' + sku.id + '"]')).toBeAttached();
  await picker.selectOption(sku.id);
}
async function evidence(page: Page) {
  await form(page)
    .getByRole("combobox", { name: "証拠の出所", exact: true })
    .selectOption("synthetic");
  await form(page)
    .getByRole("textbox", { name: "証拠参照", exact: true })
    .fill(randomUUID());
  await form(page)
    .getByRole("textbox", { name: "理由", exact: true })
    .fill("Synthetic browser evidence");
}
async function save(page: Page, path: string) {
  expect(
    await form(page).evaluate((el) => (el as HTMLFormElement).checkValidity()),
  ).toBe(true);
  page.once("dialog", (d) => d.accept());
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/" + path) && r.request().method() === "POST",
  );
  await form(page)
    .getByRole("button", { name: "サーバーに記録", exact: true })
    .click();
  const r = await response;
  expect(r.status()).toBe(200);
  return r.json();
}
async function opening(
  page: Page,
  data: Awaited<ReturnType<typeof setup>>,
  qty = "100",
) {
  await mode(page, "opening");
  await chooseSku(page, data.sku);
  await form(page)
    .getByRole("textbox", { name: "出発・対象倉庫", exact: true })
    .fill(data.a.id);
  await form(page)
    .getByRole("textbox", { name: "数量（整数）", exact: true })
    .fill(qty);
  await evidence(page);
  return save(page, "inventory/openings");
}
async function tab(page: Page, text: string) {
  await panel(page)
    .getByRole("button", { name: text, exact: true })
    .first()
    .click();
}
test("inventory browser: real UI opening reservation partial shipment receipt and exact 100-95-93 ledger", async ({
  page,
  context,
}) => {
  const d = await setup(page, context);
  await opening(page, d);
  await expect(
    panel(page).getByRole("row").filter({ hasText: d.sku.code }),
  ).toContainText("100");
  await mode(page, "draft");
  await form(page)
    .getByRole("textbox", { name: "出発・対象倉庫", exact: true })
    .fill(d.a.id);
  await form(page)
    .getByRole("textbox", { name: "到着倉庫", exact: true })
    .fill(d.b.id);
  await form(page)
    .getByRole("textbox", { name: "証拠参照", exact: true })
    .fill(randomUUID());
  const o = await save(page, "outbounds");
  await mode(page, "reserve");
  await form(page)
    .getByRole("textbox", { name: "対象ID", exact: true })
    .fill(o.id);
  await form(page)
    .getByRole("textbox", { name: "バージョン", exact: true })
    .fill("1");
  await save(page, "outbounds/" + o.id + "/reserve");
  const details = await (
    await context.request.get("/api/v1/outbounds/" + o.id)
  ).json();
  await mode(page, "ship");
  await chooseSku(page, d.sku);
  await form(page)
    .getByRole("textbox", { name: "明細ID", exact: true })
    .fill(details.lines[0].id);
  await form(page)
    .getByRole("textbox", { name: "バージョン", exact: true })
    .fill("2");
  await form(page)
    .getByRole("textbox", { name: "数量（整数）", exact: true })
    .fill("95");
  await evidence(page);
  const sh = await save(page, "outbounds/" + o.id + "/shipments");
  await mode(page, "receive");
  await chooseSku(page, d.sku);
  await form(page)
    .getByRole("textbox", { name: "対象ID", exact: true })
    .fill(o.inbound_id);
  await form(page)
    .getByRole("textbox", { name: "バージョン", exact: true })
    .fill("1");
  await form(page)
    .getByRole("textbox", { name: "Shipment明細ID", exact: true })
    .fill(sh.shipment_line_id);
  await form(page)
    .getByRole("textbox", { name: "数量（整数）", exact: true })
    .fill("93");
  await evidence(page);
  await save(page, "inbounds/" + o.inbound_id + "/receipts");
  await panel(page)
    .getByRole("button", { name: "再取得", exact: true })
    .click();
  const rows = await sql(
    "SELECT a.kind,a.warehouse_id,b.quantity,b.reserved FROM inventory_accounts a JOIN inventory_balances b ON b.account_id=a.id WHERE a.sku_id=$1",
    [d.sku.id],
  );
  expect(rows.rows.find((r) => r.kind === "transit").quantity).toBe("2");
  expect(
    rows.rows.find((r) => r.kind === "good" && r.warehouse_id === d.a.id),
  ).toMatchObject({ quantity: "5", reserved: "5" });
  expect(
    rows.rows.find((r) => r.kind === "good" && r.warehouse_id === d.b.id)
      .quantity,
  ).toBe("93");
  await tab(page, "SKU・倉庫別集計");
  await panel(page)
    .getByRole("textbox", { name: "検索", exact: true })
    .fill(d.sku.code);
  await panel(page).getByRole("button", { name: "検索", exact: true }).click();
  const sourceSummary = panel(page)
    .getByRole("row")
    .filter({ hasText: d.a.id });
  await expect(sourceSummary).toBeVisible();
  expect(
    (await sourceSummary.getByRole("cell").allTextContents()).slice(2, 10),
  ).toEqual(["5", "0", "0", "5", "5", "0", "2", "7"]);
  const targetSummary = panel(page)
    .getByRole("row")
    .filter({ hasText: d.b.id });
  expect(
    (await targetSummary.getByRole("cell").allTextContents()).slice(2, 10),
  ).toEqual(["93", "0", "0", "93", "0", "93", "0", "93"]);
  await tab(page, "原帳履歴");
  await expect(panel(page).locator("tbody tr").first()).toBeVisible();
  await panel(page)
    .getByRole("button", { name: "詳細", exact: true })
    .first()
    .click();
  await expect(panel(page).locator("article")).toContainText("recorded_at");
  await expect(
    panel(page).getByRole("region", { name: "証拠", exact: true }),
  ).toContainText("synthetic_test");
  await tab(page, "出荷依頼");
  await panel(page)
    .getByRole("textbox", { name: "検索", exact: true })
    .fill(details.business_ref);
  await panel(page).getByRole("button", { name: "検索", exact: true }).click();
  const outboundRow = panel(page)
    .getByRole("row")
    .filter({ hasText: details.business_ref });
  await outboundRow.getByRole("button", { name: "詳細", exact: true }).click();
  await panel(page)
    .getByRole("button", { name: "証拠一覧", exact: true })
    .click();
  await expect(
    panel(page).getByRole("table", { name: "証拠一覧", exact: true }),
  ).toContainText("shipped_qty: 95");
  await expect(
    panel(page).getByRole("table", { name: "証拠一覧", exact: true }),
  ).toContainText("received_qty: 93");
});
test("inventory browser: quality reclassification and reconciliation do not overwrite stock", async ({
  page,
  context,
}) => {
  const d = await setup(page, context);
  await opening(page, d);
  await mode(page, "reclassify");
  await chooseSku(page, d.sku);
  await form(page)
    .getByRole("textbox", { name: "数量（整数）", exact: true })
    .fill("7");
  await evidence(page);
  await save(page, "inventory/reclassifications");
  const rows = await sql(
    "SELECT a.id,a.kind,b.quantity FROM inventory_accounts a JOIN inventory_balances b ON b.account_id=a.id WHERE a.sku_id=$1",
    [d.sku.id],
  );
  expect(rows.rows.find((r) => r.kind === "damaged").quantity).toBe("7");
  await mode(page, "reconcile");
  await form(page)
    .getByRole("textbox", { name: "在庫口座ID", exact: true })
    .fill(rows.rows.find((r) => r.kind === "good").id);
  await form(page)
    .getByRole("textbox", { name: "観測数量", exact: true })
    .fill("90");
  await form(page)
    .getByLabel("観測基準時刻", { exact: true })
    .fill(new Date().toISOString().slice(0, -1));
  await evidence(page);
  const r = await save(page, "reconciliations");
  expect(r.state).toBe("held");
  expect(r.expected).toBe("93");
});
test("inventory browser: manual evidence is visibly held and never claims provider verified stock", async ({
  page,
  context,
}) => {
  const d = await setup(page, context);
  await mode(page, "opening");
  await chooseSku(page, d.sku);
  await form(page)
    .getByRole("textbox", { name: "出発・対象倉庫", exact: true })
    .fill(d.a.id);
  await form(page)
    .getByRole("textbox", { name: "数量（整数）", exact: true })
    .fill("100");
  await form(page)
    .getByRole("textbox", { name: "証拠参照", exact: true })
    .fill(randomUUID());
  await form(page)
    .getByRole("textbox", { name: "理由", exact: true })
    .fill("Manual unverified");
  const r = await save(page, "inventory/openings");
  expect(r.state).toBe("held");
  expect(
    (
      await sql("SELECT count(*) FROM inventory_entries WHERE sku_id=$1", [
        d.sku.id,
      ])
    ).rows[0].count,
  ).toBe("0");
});
test("inventory browser: Viewer sees stock but UI and server deny mutation", async ({
  page,
  context,
}) => {
  const d = await setup(page, context);
  await opening(page, d);
  await context.clearCookies();
  await authenticate(context, account("Viewer"));
  await page.goto("/inventory");
  await expect(
    form(page).getByRole("button", { name: "サーバーに記録", exact: true }),
  ).toBeDisabled();
  const r = await write(context, "inventory/openings", {
    source: "synthetic",
    source_event_id: randomUUID(),
    evidence_ref: randomUUID(),
    reason: "Forbidden",
    occurred_at: new Date().toISOString(),
    sku_id: d.sku.id,
    sku_version: 1,
    warehouse_id: d.a.id,
    quantity: "1",
  });
  expect(r.status()).toBe(403);
});
test("inventory browser: exact BigInt display, offline no queue and multilingual mobile shell", async ({
  page,
  context,
}) => {
  const d = await setup(page, context);
  await opening(page, d, "9007199254740993");
  await panel(page)
    .getByRole("textbox", { name: "検索", exact: true })
    .fill(d.sku.code);
  await panel(page).getByRole("button", { name: "検索", exact: true }).click();
  await expect(
    panel(page).getByRole("row").filter({ hasText: d.sku.code }),
  ).toContainText("9007199254740993");
  for (const [locale, title] of [
    ["ko", "재고 원장"],
    ["en", "Inventory ledger"],
    ["ja", "在庫原帳"],
  ] as const) {
    await page.goto("/inventory?lang=" + locale);
    await expect(
      panel(page).getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(true);
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("オフライン");
  const cached = await page.evaluate(async () => {
    const urls = [];
    for (const k of await caches.keys())
      for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return urls;
  });
  expect(cached.every((url) => !url.includes("/api/"))).toBe(true);
  await context.setOffline(false);
  await page.goto("/inventory");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  // Back is tested after the server-confirmed logout, not while its CSRF/POST is still pending.
  await expect(page.getByLabel("ログインID", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("ログインID", { exact: true })).toBeVisible();
});
test("inventory browser: transfer linkage, quarantine release and exact reversal use real UI and evidence", async ({
  page,
  context,
}) => {
  const d = await setup(page, context);
  await opening(page, d, "20");
  await mode(page, "reclassify");
  await chooseSku(page, d.sku);
  await form(page)
    .getByRole("textbox", { name: "数量（整数）", exact: true })
    .fill("3");
  await form(page)
    .getByRole("combobox", { name: "変更後区分", exact: true })
    .selectOption("quarantine");
  await evidence(page);
  const classified = await save(page, "inventory/reclassifications");
  await mode(page, "reverse");
  await form(page)
    .getByRole("textbox", { name: "原取引ID", exact: true })
    .fill(classified.id);
  await evidence(page);
  await save(page, "inventory/reversals");
  await mode(page, "transfer");
  await chooseSku(page, d.sku);
  await form(page)
    .getByRole("textbox", { name: "数量（整数）", exact: true })
    .fill("5");
  await form(page)
    .getByRole("textbox", { name: "出発・対象倉庫", exact: true })
    .fill(d.a.id);
  await form(page)
    .getByRole("textbox", { name: "到着倉庫", exact: true })
    .fill(d.b.id);
  await form(page)
    .getByRole("textbox", { name: "証拠参照", exact: true })
    .fill(randomUUID());
  const transfer = await save(page, "transfers");
  expect(transfer.transfer_id).toBeTruthy();
  const link = await sql("SELECT * FROM transfers WHERE id=$1", [
    transfer.transfer_id,
  ]);
  expect(link.rows[0]).toMatchObject({
    outbound_id: transfer.id,
    inbound_id: transfer.inbound_id,
  });
  await mode(page, "reserve");
  await form(page)
    .getByRole("textbox", { name: "対象ID", exact: true })
    .fill(transfer.id);
  await form(page)
    .getByRole("textbox", { name: "バージョン", exact: true })
    .fill("1");
  await save(page, "outbounds/" + transfer.id + "/reserve");
  const good = (
    await sql(
      "SELECT b.quantity,b.reserved FROM inventory_balances b JOIN inventory_accounts a ON a.id=b.account_id WHERE a.sku_id=$1 AND a.kind='good'",
      [d.sku.id],
    )
  ).rows[0];
  expect(good).toMatchObject({ quantity: "20", reserved: "5" });
});
test("inventory browser: response loss and double submit preserve one opening and retain version-conflict input", async ({
  page,
  context,
}) => {
  const d = await setup(page, context);
  await mode(page, "opening");
  await chooseSku(page, d.sku);
  await form(page)
    .getByRole("textbox", { name: "出発・対象倉庫", exact: true })
    .fill(d.a.id);
  await form(page)
    .getByRole("textbox", { name: "数量（整数）", exact: true })
    .fill("100");
  await evidence(page);
  await page.route(
    "**/api/v1/inventory/openings",
    async (route) => {
      await route.fetch();
      await route.abort();
    },
    { times: 1 },
  );
  page.once("dialog", (d) => d.accept());
  await form(page)
    .getByRole("button", { name: "サーバーに記録", exact: true })
    .click();
  await expect(panel(page).getByRole("alert")).toBeVisible();
  await save(page, "inventory/openings");
  expect(
    (
      await sql("SELECT count(*) FROM inventory_entries WHERE sku_id=$1", [
        d.sku.id,
      ])
    ).rows[0].count,
  ).toBe("2");
  const planned = await write(context, "outbounds", {
    business_ref: randomUUID(),
    source_warehouse_id: d.a.id,
    destination_warehouse_id: d.b.id,
    lines: [{ sku_id: d.sku.id, sku_version: 1, quantity: "70" }],
  });
  const o = await planned.json();
  expect(
    (
      await write(context, "outbounds/" + o.id + "/reserve", { version: "1" })
    ).status(),
  ).toBe(200);
  await mode(page, "reserve");
  await form(page)
    .getByRole("textbox", { name: "対象ID", exact: true })
    .fill(o.id);
  await form(page)
    .getByRole("textbox", { name: "バージョン", exact: true })
    .fill("1");
  page.once("dialog", (d) => d.accept());
  await form(page)
    .getByRole("button", { name: "サーバーに記録", exact: true })
    .click();
  await expect(panel(page).getByRole("alert")).toContainText("バージョン競合");
  await expect(
    form(page).getByRole("textbox", { name: "対象ID", exact: true }),
  ).toHaveValue(o.id);
  expect(
    (
      await sql(
        "SELECT count(*) FROM reservations WHERE outbound_line_id IN(SELECT id FROM outbound_lines WHERE outbound_id=$1)",
        [o.id],
      )
    ).rows[0].count,
  ).toBe("1");
  await mode(page, "opening");
  await chooseSku(page, d.sku);
  await form(page)
    .getByRole("textbox", { name: "出発・対象倉庫", exact: true })
    .fill(d.b.id);
  await form(page)
    .getByRole("textbox", { name: "数量（整数）", exact: true })
    .fill("25");
  await evidence(page);
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/v1/inventory/openings") && r.method() === "POST")
      calls++;
  });
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/inventory/openings") &&
      r.request().method() === "POST",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await form(page).evaluate((element) => {
    (element as HTMLFormElement).requestSubmit();
    (element as HTMLFormElement).requestSubmit();
  });
  expect((await response).status()).toBe(200);
  expect(calls).toBe(1);
  expect(
    (
      await sql(
        "SELECT b.quantity FROM inventory_balances b JOIN inventory_accounts a ON a.id=b.account_id WHERE a.sku_id=$1 AND a.warehouse_id=$2 AND a.kind='good'",
        [d.sku.id, d.b.id],
      )
    ).rows[0].quantity,
  ).toBe("25");
});
test("inventory browser: warehouse scope and live revocation deny hidden API and remove protected data", async ({
  page,
  context,
}) => {
  const d = await setup(page, context);
  await opening(page, d);
  const viewer = account("Viewer");
  await sql("UPDATE user_roles SET revoked_at=now() WHERE user_id=$1", [
    viewer.id,
  ]);
  await sql(
    "INSERT INTO user_roles(id,user_id,role_id,scope,warehouse_id,granted_by) SELECT $1,$2,id,'warehouse',$3,$4 FROM roles WHERE code='Viewer'",
    [randomUUID(), viewer.id, d.a.id, d.user.id],
  );
  await context.clearCookies();
  await authenticate(context, viewer);
  await page.goto("/inventory");
  await expect(panel(page)).toBeVisible();
  expect(
    (
      await context.request.get("/api/v1/inventory?warehouse_id=" + d.b.id)
    ).status(),
  ).toBe(403);
  await sql("UPDATE user_roles SET revoked_at=now() WHERE user_id=$1", [
    viewer.id,
  ]);
  await page.getByRole("button", { name: "再取得", exact: true }).click();
  await expect(panel(page).getByRole("alert")).toBeVisible();
  expect((await context.request.get("/api/v1/inventory")).status()).toBe(403);
});
