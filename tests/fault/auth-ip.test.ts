import { it, expect } from "vitest";
import { authFixture } from "../auth-helper";
it("S19: one IP spraying distinct account names is limited despite forged forwarding headers", async () => {
  const f = await authFixture();
  try {
    await f.request("auth/csrf");
    for (let i = 0; i < 40; i++) {
      const response = await f.request(
        "auth/login",
        { login: "unknown-" + i, password: f.password },
        "POST",
        { "x-forwarded-for": "192.0.2." + (i + 1) },
      );
      expect(response.statusCode).toBe(401);
    }
    expect(
      (
        await f.request(
          "auth/login",
          { login: "administrator", password: f.password },
          "POST",
          { "x-forwarded-for": "198.51.100.1" },
        )
      ).statusCode,
    ).toBe(429);
  } finally {
    await f.cleanup();
  }
});
