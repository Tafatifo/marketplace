import path from "node:path";
import { defineConfig } from "vitest/config";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://fluent:fluent_dev_password@localhost:5432/fluent_academy_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/setup/server-only.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/setup/global.ts"],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DB,
      APP_URL: "http://localhost:3000",
      APP_SECRET: "test-secret-test-secret-test-secret",
      AI_PROVIDER: "practice",
      STT_PROVIDER: "mock",
      TTS_PROVIDER: "none",
      SPEECH_SERVICE_URL: "",
      BILLING_MODE: "simulation",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      SMTP_URL: "",
      RECORDINGS_DIR: "./storage/test-recordings",
      LOG_LEVEL: "error",
    },
  },
});
