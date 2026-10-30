/**
 * Periodic maintenance. Run it daily (cron, a scheduled container, or a platform job):
 *   npm run jobs:cleanup
 *
 * - Deletes speaking recordings past their retention date (the attempt's transcript
 *   and feedback stay until the learner deletes them).
 * - Removes expired sessions, used/expired password reset tokens and rate-limit buckets.
 * - Drops usage counters older than 90 days and system events older than 90 days.
 */
import { db } from "../../src/server/db";
import { purgeExpiredRateLimits } from "../../src/server/rate-limit";
import { purgeExpiredRecordings } from "../../src/server/speech/retention";

async function main() {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
  let recordings = 0;
  // purgeExpiredRecordings works in batches of 1000.
  for (;;) {
    const n = await purgeExpiredRecordings(now);
    recordings += n;
    if (n < 1000) break;
  }
  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const resets = await db.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } });
  const buckets = await purgeExpiredRateLimits();
  const usage = await db.usageCounter.deleteMany({ where: { periodStart: { lt: ninetyDaysAgo } } });
  const events = await db.systemEvent.deleteMany({ where: { createdAt: { lt: ninetyDaysAgo } } });
  const summary = { recordings, sessions: sessions.count, resetTokens: resets.count, rateLimitBuckets: buckets.count, usageCounters: usage.count, systemEvents: events.count };
  console.log(JSON.stringify({ job: "cleanup", at: now.toISOString(), ...summary }));
}

main()
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
