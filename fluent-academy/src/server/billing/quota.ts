import "server-only";
import { db } from "../db";
import { paymentRequired } from "../http";
import { localDay } from "@/lib/dates";

export type Metric = "lesson_start" | "ai_conversation" | "ai_message" | "speech_attempt" | "vocab_review";

const LABEL: Record<Metric, string> = {
  lesson_start: "lessons",
  ai_conversation: "coach conversations",
  ai_message: "coach messages",
  speech_attempt: "speaking recordings",
  vocab_review: "vocabulary reviews",
};

async function tzOf(userId: string) {
  return (await db.userPreferences.findUnique({ where: { userId }, select: { timezone: true } }))?.timezone ?? "UTC";
}

export async function usageToday(userId: string, metric: Metric) {
  const periodStart = localDay(await tzOf(userId));
  const row = await db.usageCounter.findUnique({ where: { userId_metric_periodStart: { userId, metric, periodStart } } });
  return row?.count ?? 0;
}

/**
 * Atomically consumes one unit of a daily quota. `limit` null means unlimited.
 * Throws 402 with an upgrade hint when the limit is reached.
 */
export async function consumeQuota(userId: string, metric: Metric, limit: number | null, amount = 1) {
  const periodStart = localDay(await tzOf(userId));
  const row = await db.usageCounter.upsert({
    where: { userId_metric_periodStart: { userId, metric, periodStart } },
    create: { userId, metric, periodStart, count: amount },
    update: { count: { increment: amount } },
  });
  if (limit !== null && row.count > limit) {
    await db.usageCounter.update({ where: { id: row.id }, data: { count: { decrement: amount } } });
    throw paymentRequired(`You've used today's ${limit} ${LABEL[metric]} on the Free plan. Upgrade to Premium for more, or come back tomorrow.`, {
      metric,
      limit,
    });
  }
  return { used: row.count, limit };
}
