import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import {
  createDatabase,
  developmentDatabaseUrl,
  testDatabaseUrl,
  schemaName,
} from "@wms/db";
import { AuthService } from "../apps/api/src/auth/service.js";
import {
  encryptionKey,
  newTotp,
  passwordHash,
  normalizeLogin,
  encrypt,
  totpStep,
  recoveryCodes,
} from "../apps/api/src/auth/crypto.js";
if (process.env.NODE_ENV === "production" || !process.stdin.isTTY)
  throw new Error("LOCAL_INTERACTIVE_TERMINAL_REQUIRED");
// Hidden input: never pass a password in argv/environment or echo it to a log.
let hidden = false;
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!hidden) process.stdout.write(chunk);
    done();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
const testing = process.argv.includes("--test");
const recover = process.argv.includes("--recover");
if (
  testing &&
  (process.env.NODE_ENV !== "test" ||
    !process.env.DB_SCHEMA?.startsWith("wms_test_"))
)
  throw new Error("TEST_SCHEMA_REQUIRED");
const db = createDatabase(
  testing
    ? testDatabaseUrl(process.env.TEST_DATABASE_URL)
    : developmentDatabaseUrl(process.env.DATABASE_URL),
  testing ? { schema: schemaName(process.env.DB_SCHEMA!) } : {},
);
try {
  if (!(await db.check())) throw new Error("MIGRATION_REQUIRED");
  if (
    !recover &&
    (await db.pool.query("SELECT 1 FROM auth_bootstrap")).rowCount
  )
    throw new Error("BOOTSTRAP_ALREADY_COMPLETE");
  const service = new AuthService(
    db.pool,
    encryptionKey(process.env.AUTH_ENCRYPTION_KEY),
    process.env.AUTH_ORIGIN ?? "http://127.0.0.1:5173",
  );
  const login = await rl.question("Login ID: ");
  const name = await rl.question("Display name: ");
  process.stdout.write("Password (14–128 characters, hidden): ");
  hidden = true;
  const password = await rl.question("");
  hidden = false;
  process.stdout.write("\n");
  process.stdout.write("Repeat password (hidden): ");
  hidden = true;
  const confirmation = await rl.question("");
  hidden = false;
  process.stdout.write("\n");
  if (password !== confirmation) throw new Error("PASSWORD_MISMATCH");
  const otp = newTotp(login);
  process.stdout.write(
    "Register this one-time enrollment URI in your authenticator, then clear the terminal:\n" +
      otp.toString() +
      "\n",
  );
  const code = await rl.question("Current six-digit TOTP: ");
  const result = recover
    ? await (async () => {
        const normalized = normalizeLogin(login),
          hash = await passwordHash(password),
          step = totpStep(otp.secret.base32, code);
        if (step === null) throw new Error("INVALID_FACTOR");
        const codes = recoveryCodes();
        return service.tx(async (c) => {
          await c.query("SELECT pg_advisory_xact_lock(74002)");
          const user = (
            await c.query(
              "SELECT u.id FROM users u JOIN auth_bootstrap b ON b.user_id=u.id WHERE u.login=$1 FOR UPDATE OF u",
              [normalized],
            )
          ).rows[0];
          if (!user) throw new Error("BOOTSTRAP_IDENTITY_REQUIRED");
          await c.query(
            "UPDATE users SET status='active',password_hash=$1,password_changed_at=now(),mfa_enabled=true,session_epoch=session_epoch+1,updated_at=now() WHERE id=$2",
            [hash, user.id],
          );
          await c.query(
            "UPDATE mfa_credentials SET encrypted_secret=$1,activated_at=now(),last_step=$2,pending_secret=NULL,revoked_at=NULL WHERE user_id=$3",
            [
              encrypt(
                otp.secret.base32,
                encryptionKey(process.env.AUTH_ENCRYPTION_KEY),
                user.id,
              ),
              step,
              user.id,
            ],
          );
          await c.query(
            "UPDATE sessions SET revoked_at=now() WHERE user_id=$1",
            [user.id],
          );
          await service.storeCodes(c, user.id, codes);
          await service.audit(
            c,
            user.id,
            "local.administrator.recovered",
            user.id,
            "DEVELOPMENT_ONLY",
            "local-cli",
          );
          return { id: user.id, codes };
        });
      })()
    : await service.bootstrap(login, password, name, otp.secret.base32, code);
  process.stdout.write(
    "Administrator credentials ready. Store these one-use recovery codes offline; they cannot be retrieved again:\n" +
      result.codes.join("\n") +
      "\n",
  );
} catch {
  process.stderr.write(
    "Bootstrap failed safely. Check configuration, password policy, TOTP and existing administrator.\n",
  );
  process.exitCode = 1;
} finally {
  rl.close();
  await db.close();
}
