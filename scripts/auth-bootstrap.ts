import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createDatabase, developmentDatabaseUrl } from "@wms/db";
import { AuthService } from "../apps/api/src/auth/service.js";
import { encryptionKey, newTotp } from "../apps/api/src/auth/crypto.js";
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
const db = createDatabase(developmentDatabaseUrl(process.env.DATABASE_URL));
try {
  if (!(await db.check())) throw new Error("MIGRATION_REQUIRED");
  if ((await db.pool.query("SELECT 1 FROM auth_bootstrap")).rowCount)
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
  const result = await service.bootstrap(
    login,
    password,
    name,
    otp.secret.base32,
    code,
  );
  process.stdout.write(
    "Administrator created. Store these one-use recovery codes offline; they cannot be retrieved again:\n" +
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
