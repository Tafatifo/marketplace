import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Use a pre-installed Chromium when available (CI images, sandboxes); otherwise Playwright's own.
const chromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * End-to-end tests run against a running app with imported content
 * (`npm run content:import`). Each test signs up its own account.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: chromium ? { executablePath: chromium } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000 },
});
