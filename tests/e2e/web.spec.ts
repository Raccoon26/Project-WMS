import { test, expect } from "./auth-fixture";
import { routes } from "../../apps/web/src/routes";
test("Japanese dashboard, desktop/mobile navigation and all 15 routes", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "運用の基盤を、確かに。",
  );
  await expect(page.getByTestId("api-status")).toHaveText("接続済み");
  for (const [path] of routes) {
    if (isMobile)
      await page.getByRole("button", { name: "メニューを開く" }).click();
    await page.locator(`nav a[href="${path}"]`).click();
    await expect(page.locator(`nav a[href="${path}"]`)).toHaveAttribute(
      "aria-current",
      "page",
    );
    if (path !== "/" && path !== "/system-health")
      await expect(page.locator("main .empty .pill")).toHaveText("未実装");
  }
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ページが見つかりません",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("locale switch, invalid locale and API failure are visible", async ({
  page,
}) => {
  await page.goto("/?lang=unknown");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await page.getByRole("combobox").selectOption("en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A dependable foundation.",
  );
  await page.getByRole("combobox").selectOption("ko");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await page.route("**/api/v1/health/ready", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "SERVICE_UNAVAILABLE" }),
    }),
  );
  await page.getByRole("button", { name: /다시 확인/ }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("database-status")).toHaveText(
    "연결할 수 없음",
  );
  await expect(page.getByTestId("api-status")).toHaveText("연결됨");
  await page.unroute("**/api/v1/health/ready");
  await page.route("**/api/v1/health/ready", (route) => route.abort());
  await page.getByRole("button", { name: /다시 확인/ }).click();
  await expect(page.getByTestId("api-status")).toHaveText("연결할 수 없음");
  await expect(page.getByTestId("database-status")).toHaveText("미확인");
});
test("installed static shell works offline without API caching or replaying writes", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page.reload();
  await expect(page.getByTestId("api-status")).toHaveText("接続済み");
  const entries = await page.evaluate(async () => {
    const values: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const r of await cache.keys()) values.push(new URL(r.url).pathname);
    }
    return values;
  });
  expect(entries).toContain("/index.html");
  expect(entries.some((p) => p.startsWith("/api"))).toBe(false);
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/api/")) writes++;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("status")).toContainText("オフライン");
  const rejected = await page.evaluate(async () => {
    try {
      await fetch("/api/v1/outbounds", { method: "POST", body: "synthetic" });
      return false;
    } catch {
      return true;
    }
  });
  expect(rejected).toBe(true);
  const before = writes;
  await context.setOffline(false);
  await expect(page.getByTestId("api-status")).toHaveText("接続済み");
  await page.waitForTimeout(300);
  expect(writes).toBe(before);
});

test("manifest and accessible mobile drawer are functional", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.name).toBe("Project WMS");
  expect(manifest.display).toBe("standalone");
  expect((await page.request.get(manifest.icons[0].src)).status()).toBe(200);
  if (isMobile) {
    const toggle = page.getByRole("button", { name: "メニューを開く" });
    await expect(page.locator("aside")).toHaveAttribute("inert", "");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("aside")).not.toHaveAttribute("inert", "");
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    const size = await toggle.boundingBox();
    expect(size!.height).toBeGreaterThanOrEqual(44);
  } else {
    await expect(page.getByRole("navigation")).toBeVisible();
  }
});
