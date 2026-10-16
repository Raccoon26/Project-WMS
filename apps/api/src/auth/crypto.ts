import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import * as OTPAuth from "otpauth";
export const POLICY_VERSION = 1;
export function normalizeLogin(value: string): string {
  const result = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._@+-]{2,63}$/.test(result))
    throw new Error("INVALID_INPUT");
  return result;
}
export function validatePassword(value: string): void {
  if (
    [...value].length < 14 ||
    value.length > 128 ||
    Buffer.byteLength(value) > 512
  )
    throw new Error("INVALID_INPUT");
}
let busy = 0;
export async function passwordHash(value: string): Promise<string> {
  validatePassword(value);
  if (busy >= 2) throw new Error("RATE_LIMITED");
  busy++;
  try {
    return await hash(value, {
      algorithm: 2 /* Argon2id library enum value; const enum incompatible with isolated TS */,
      memoryCost: 19456,
      timeCost: 3,
      parallelism: 1,
    });
  } finally {
    busy--;
  }
}
export async function passwordVerify(
  encoded: string,
  value: string,
): Promise<boolean> {
  if (value.length > 128 || busy >= 2) return false;
  busy++;
  try {
    return await verify(encoded, value);
  } catch {
    return false;
  } finally {
    busy--;
  }
}
export const token = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function equalDigest(raw: string, expected: string): boolean {
  const actual = Buffer.from(digest(raw));
  const other = Buffer.from(expected);
  return actual.length === other.length && timingSafeEqual(actual, other);
}
export function encryptionKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new Error("AUTH_KEY_REQUIRED");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || new Set(key).size < 16)
    throw new Error("AUTH_KEY_INVALID");
  return key;
}
export function encrypt(secret: string, key: Buffer, user: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(user));
  const payload = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), payload]
    .map((b) => b.toString("base64"))
    .join(".");
}
export function decrypt(value: string, key: Buffer, user: string): string {
  const parts = value.split(".").map((v) => Buffer.from(v, "base64"));
  if (parts.length !== 3) throw new Error("CREDENTIAL_UNAVAILABLE");
  const decipher = createDecipheriv("aes-256-gcm", key, parts[0]!);
  decipher.setAAD(Buffer.from(user));
  decipher.setAuthTag(parts[1]!);
  return Buffer.concat([decipher.update(parts[2]!), decipher.final()]).toString(
    "utf8",
  );
}
export function newTotp(login: string) {
  return new OTPAuth.TOTP({
    issuer: "Project WMS",
    label: login,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });
}
export function totpStep(
  secret: string,
  code: string,
  timestamp = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const otp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  const delta = otp.validate({ token: code, timestamp, window: 1 });
  return delta === null ? null : Math.floor(timestamp / 30000) + delta;
}
export function recoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => randomBytes(16).toString("hex"));
}

export function totpCode(secret: string, timestamp = Date.now()): string {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate({ timestamp });
}
