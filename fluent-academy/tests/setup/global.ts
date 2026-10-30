import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://fluent:fluent_dev_password@localhost:5432/fluent_academy_test";

/** Migrates the test database, clears learner data and imports the curriculum once per run. */
export default async function setup() {
  if (!/test/.test(TEST_DB)) throw new Error(`Refusing to run tests against a database whose name doesn't contain "test": ${TEST_DB}`);
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "pipe" });
  const db = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
  try {
    await db.$executeRawUnsafe(`TRUNCATE "User", "RateLimitBucket", "PaymentEvent", "SystemEvent", "AuditLog" CASCADE`);
    const { runImport } = await import("../../src/server/content/importer");
    await runImport(db, { publish: true, resetPlans: true, triggeredBy: "tests" });
  } finally {
    await db.$disconnect();
  }
}
