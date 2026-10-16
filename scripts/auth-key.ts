import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
// Add configuration only; never overwrite an existing file/key or print secrets.
if (!existsSync(".env")) throw new Error("RUN_DEV_SETUP_FIRST");
const text = readFileSync(".env", "utf8");
if (/^AUTH_ENCRYPTION_KEY=/m.test(text) || /^AUTH_ORIGIN=/m.test(text))
  throw new Error("AUTH_CONFIGURATION_EXISTS");
appendFileSync(
  ".env",
  "\nAUTH_ENCRYPTION_KEY=" +
    randomBytes(32).toString("base64") +
    "\nAUTH_ORIGIN=http://127.0.0.1:5173\n",
  { mode: 0o600 },
);
console.log(
  "Local authentication configuration added; existing settings preserved.",
);
