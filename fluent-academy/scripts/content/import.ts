/**
 * Import the curriculum into the database.
 *   npm run content:import            # publish new and changed content immediately (development)
 *   npm run content:import -- --draft # stage changes as revisions awaiting review
 *   npm run content:import -- --reset-plans
 */
import { PrismaClient } from "@prisma/client";
import { runImport } from "../../src/server/content/importer";

const db = new PrismaClient();
const publish = !process.argv.includes("--draft");
const resetPlans = process.argv.includes("--reset-plans");

runImport(db, { publish, resetPlans, triggeredBy: "cli", log: (m) => console.log(m) })
  .then((summary) => {
    console.log(JSON.stringify({ ...summary, errors: summary.errors.length }, null, 2));
  })
  .catch((err) => {
    console.error("Import failed:", err.message);
    if (err.summary?.errors?.length) for (const e of err.summary.errors.slice(0, 50)) console.error(" -", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
