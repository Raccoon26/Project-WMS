import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { conditions: ["source"] },
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
