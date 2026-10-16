import { it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  passwordHash,
  passwordVerify,
  normalizeLogin,
  validatePassword,
  token,
  digest,
  equalDigest,
  encryptionKey,
  encrypt,
  decrypt,
  newTotp,
  totpStep,
  recoveryCodes,
} from "../../apps/api/src/auth/crypto";
import {
  allowed,
  recentReauth,
  rolePolicies,
} from "../../apps/api/src/auth/policy";
import { authText } from "../../apps/web/src/auth";
import { apiError } from "@wms/contracts";
import { authOptions } from "../../apps/api/src/auth/routes";
it("Argon2id hashes randomized passwords and rejects incorrect input", async () => {
  const p = token(),
    h = await passwordHash(p);
  expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=3,p=1\$/);
  expect(await passwordVerify(h, p)).toBe(true);
  expect(await passwordVerify(h, p + "!")).toBe(false);
  expect(await passwordVerify("invalid", p)).toBe(false);
  expect(await passwordVerify(h, "x".repeat(129))).toBe(false);
});
it("login normalization rejects Unicode ambiguity and enforces password bounds", () => {
  expect(normalizeLogin(" Example.USER ")).toBe("example.user");
  for (const s of ["ab", "Ａdmin", "a b", "a".repeat(65)])
    expect(() => normalizeLogin(s)).toThrow();
  for (const s of ["short", "x".repeat(129)])
    expect(() => validatePassword(s)).toThrow();
  expect(() => validatePassword("長".repeat(14))).not.toThrow();
});
it("opaque tokens are unique and stored as hashes rather than JWTs", () => {
  const a = token(),
    b = token();
  expect(a).not.toBe(b);
  expect(a).not.toContain(".");
  expect(a.length).toBe(43);
  expect(digest(a)).not.toContain(a);
  expect(equalDigest(a, digest(a))).toBe(true);
  expect(equalDigest(b, digest(a))).toBe(false);
  expect(equalDigest(a, "short")).toBe(false);
});
it("TOTP validates limited clock drift and rejects malformed, expired and wrong codes", () => {
  const otp = newTotp("synthetic"),
    now = 1792166400000;
  expect(
    totpStep(otp.secret.base32, otp.generate({ timestamp: now }), now),
  ).toBe(now / 30000);
  expect(
    totpStep(otp.secret.base32, otp.generate({ timestamp: now - 30000 }), now),
  ).toBe(now / 30000 - 1);
  expect(
    totpStep(otp.secret.base32, otp.generate({ timestamp: now - 90000 }), now),
  ).toBeNull();
  expect(totpStep(otp.secret.base32, "abcdef", now)).toBeNull();
});
it("TOTP secrets use authenticated encryption bound to their owner", () => {
  const key = randomBytes(32),
    secret = newTotp("synthetic").secret.base32,
    encrypted = encrypt(secret, key, "owner");
  expect(encrypted).not.toContain(secret);
  expect(decrypt(encrypted, key, "owner")).toBe(secret);
  expect(() => decrypt(encrypted, key, "other")).toThrow();
  expect(() => decrypt(encrypted, randomBytes(32), "owner")).toThrow();
  expect(encrypt(secret, key, "owner")).not.toBe(encrypted);
});
it("encryption configuration has no implicit default or production HTTP exception", () => {
  expect(() => encryptionKey(undefined)).toThrow();
  expect(() => encryptionKey(Buffer.alloc(32).toString("base64"))).toThrow();
  expect(() =>
    authOptions({} as never, {
      AUTH_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      AUTH_ORIGIN: "http://example.org",
    }),
  ).toThrow();
});
it("permission evaluator denies by default, invalid policy versions and unknown warehouse scopes", () => {
  expect(allowed([], "users.manage")).toBe(false);
  expect(
    allowed(
      [{ permission: "users.manage", scope: "global", policyVersion: 1 }],
      "users.manage",
    ),
  ).toBe(true);
  expect(
    allowed(
      [{ permission: "users.manage", scope: "global", policyVersion: 2 }],
      "users.manage",
    ),
  ).toBe(false);
  expect(
    allowed(
      [{ permission: "inventory.read", scope: "global", policyVersion: 1 }],
      "inventory.read",
      "unknown",
    ),
  ).toBe(false);
  expect(
    allowed(
      [
        {
          permission: "inventory.read",
          scope: "warehouse-a",
          policyVersion: 1,
        },
      ],
      "inventory.read",
      "warehouse-b",
      ["warehouse-a", "warehouse-b"],
    ),
  ).toBe(false);
  expect(rolePolicies.Viewer).not.toContain("users.manage");
});
it("reauthentication expires exactly at five minutes and rejects future timestamps", () => {
  const now = Date.now();
  expect(recentReauth(new Date(now - 299999), now)).toBe(true);
  expect(recentReauth(new Date(now - 300000), now)).toBe(false);
  expect(recentReauth(new Date(now + 1), now)).toBe(false);
  expect(recentReauth(null)).toBe(false);
});
it("recovery codes are high entropy unique random one-time material", () => {
  const codes = recoveryCodes();
  expect(new Set(codes).size).toBe(10);
  expect(codes.every((c) => /^[a-f0-9]{32}$/.test(c))).toBe(true);
});
it("auth errors preserve public contracts and Japanese Korean English messages", () => {
  expect(apiError("UNAUTHORIZED", "request-id")).toEqual({
    code: "UNAUTHORIZED",
    messageKey: "auth.unauthorized",
    requestId: "request-id",
    retryable: false,
    details: null,
  });
  for (const locale of ["ja", "ko", "en"] as const)
    expect(authText(locale, "login")).toBeTruthy();
  expect(authText("ja", "login")).toBe("ログイン");
});
