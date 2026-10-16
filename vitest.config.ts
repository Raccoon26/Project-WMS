import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    // SSR resolution must not depend on retained dist outputs in a fresh checkout.
    alias: Object.fromEntries(
      ["domain", "contracts", "db", "runtime", "integrations"].map((name) => [
        "@wms/" + name,
        fileURLToPath(
          new URL("./packages/" + name + "/src/index.ts", import.meta.url),
        ),
      ]),
    ),
    conditions: ["source"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
    maxWorkers: 1,
    passWithNoTests: false,
    sequence: { concurrent: false },
  },
});
