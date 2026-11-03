import "server-only";
import { db } from "../db";
import { recordingStore } from "../storage";

/**
 * Retention policy: deletes recordings whose retention period has ended. The attempt
 * row (transcript and feedback) stays until the learner deletes it. Processes up to
 * 1000 recordings per call and returns how many were removed.
 */
export async function purgeExpiredRecordings(now = new Date()) {
  const expired = await db.speakingAttempt.findMany({ where: { audioExpiresAt: { lt: now }, audioKey: { not: null } }, select: { id: true, audioKey: true }, take: 1000 });
  for (const a of expired) await recordingStore().delete(a.audioKey!);
  await db.speakingAttempt.updateMany({ where: { id: { in: expired.map((a) => a.id) } }, data: { audioKey: null, audioExpiresAt: null } });
  return expired.length;
}
