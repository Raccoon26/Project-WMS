import { it, expect } from "vitest";
import { datetimeLocalInput } from "../e2e/datetime-input";
it.each([
  ["610", ".61"],
  ["000", ""],
  ["600", ".6"],
  ["010", ".01"],
  ["001", ".001"],
  ["123", ".123"],
])(
  "datetime-local canonical spelling preserves exact milliseconds %s",
  (ms, suffix) => {
    const date = new Date("2026-10-19T04:27:33." + ms + "Z"),
      text = datetimeLocalInput(date);
    expect(text).toBe("2026-10-19T04:27:33" + suffix);
    expect(new Date(text + "Z").getTime()).toBe(date.getTime());
  },
);
it("zero seconds without fractions uses canonical minute precision without changing the instant", () => {
  const date = new Date("2026-10-19T04:27:00.000Z"),
    value = datetimeLocalInput(date);
  expect(value).toBe("2026-10-19T04:27");
  expect(new Date(value + "Z").getTime()).toBe(date.getTime());
});
