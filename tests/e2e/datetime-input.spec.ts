import { test, expect } from "@playwright/test";
import { datetimeLocalInput } from "./datetime-input";
test("browser input interoperability: canonical datetime-local retains exact milliseconds", async ({
  page,
}) => {
  await page.setContent(
    '<label>Cutoff<input type="datetime-local" step="0.001"></label>',
  );
  for (const iso of [
    "2026-10-19T04:27:33.610Z",
    "2026-10-19T04:27:33.000Z",
    "2026-10-19T04:27:00.000Z",
  ]) {
    const original = new Date(iso),
      value = datetimeLocalInput(original);
    await page.getByLabel("Cutoff").fill(value);
    expect(await page.getByLabel("Cutoff").inputValue()).toBe(value);
    expect(new Date(value + "Z").getTime()).toBe(original.getTime());
  }
});
