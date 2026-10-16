import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "@wms/db";
const database = testDatabaseUrl(process.env.TEST_DATABASE_URL);
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/browser",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm start:api",
      url: "http://127.0.0.1:3001/api/v1/health/ready",
      reuseExistingServer: false,
      env: { NODE_ENV: "test", DATABASE_URL: database, API_PORT: "3001" },
      timeout: 30000,
    },
    {
      command: "pnpm --filter @wms/web preview --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
