import { it, expect } from "vitest";
import { authText, AuthRequestError } from "../../apps/web/src/auth";
it("authentication rate and expiry errors are explicit in Japanese Korean English without exposing credentials", () => {
  for (const locale of ["ja", "ko", "en"] as const) {
    expect(authText(locale, "limited")).toBeTruthy();
    expect(authText(locale, "expired")).toBeTruthy();
  }
  const error = new AuthRequestError(429);
  expect(error.status).toBe(429);
  expect(error.message).toBe("REQUEST_FAILED");
  expect(authText("ja", "limited")).toContain("試行回数");
  expect(authText("ja", "expired")).toContain("有効期限");
});
