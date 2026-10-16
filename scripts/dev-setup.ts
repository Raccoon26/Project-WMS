import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
let current: string | undefined;
try {
  current = await readFile(".env", "utf8");
} catch {
  /* missing file */
}
if (current && !current.includes("replace-with-local-value"))
  throw new Error("Existing .env preserved; edit it manually if needed");
const example = await readFile(".env.example", "utf8");
const local = randomBytes(24).toString("hex");
if (current && current !== example)
  throw new Error(
    "Modified .env preserved; do not overwrite user configuration",
  );
await writeFile(".env", example.replaceAll("replace-with-local-value", local), {
  mode: 0o600,
  flag: current ? "w" : "wx",
});
console.log(
  "Development .env prepared; values are not displayed. Never use in production.",
);
