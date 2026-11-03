import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { localDay } from "@/lib/dates";

export interface ActivityDelta {
  xp?: number;
  minutes?: number;
  lessonsCompleted?: number;
  exercisesAnswered?: number;
  exercisesCorrect?: number;
  reviews?: number;
  conversations?: number;
  speakingAttempts?: number;
  readings?: number;
}

async function timezoneOf(userId: string) {
  const p = await db.userPreferences.findUnique({ where: { userId }, select: { timezone: true, dailyGoalXp: true } });
  return { tz: p?.timezone ?? "UTC", goal: p?.dailyGoalXp ?? 50 };
}

/** Adds to today's activity row (in the learner's time zone) and marks the daily goal when met. */
export async function recordActivity(userId: string, delta: ActivityDelta) {
  const { tz, goal } = await timezoneOf(userId);
  const date = localDay(tz);
  const inc = (n?: number) => ({ increment: n ?? 0 });
  const row = await db.dailyActivity.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      xp: delta.xp ?? 0,
      minutes: delta.minutes ?? 0,
      lessonsCompleted: delta.lessonsCompleted ?? 0,
      exercisesAnswered: delta.exercisesAnswered ?? 0,
      exercisesCorrect: delta.exercisesCorrect ?? 0,
      reviews: delta.reviews ?? 0,
      conversations: delta.conversations ?? 0,
      speakingAttempts: delta.speakingAttempts ?? 0,
      readings: delta.readings ?? 0,
    },
    update: {
      xp: inc(delta.xp),
      minutes: inc(delta.minutes),
      lessonsCompleted: inc(delta.lessonsCompleted),
      exercisesAnswered: inc(delta.exercisesAnswered),
      exercisesCorrect: inc(delta.exercisesCorrect),
      reviews: inc(delta.reviews),
      conversations: inc(delta.conversations),
      speakingAttempts: inc(delta.speakingAttempts),
      readings: inc(delta.readings),
    },
  });
  if (!row.goalMet && row.xp >= goal) {
    await db.dailyActivity.update({ where: { id: row.id }, data: { goalMet: true } });
  }
  return row;
}

/**
 * Awards XP exactly once per (reason, source). Returns the XP actually awarded (0 for duplicates).
 * XP is only ever granted for completed, validated work.
 */
export async function awardXp(userId: string, amount: number, reason: string, sourceType: string, sourceId: string, minutes = 0) {
  if (amount <= 0) return 0;
  try {
    await db.xpTransaction.create({ data: { userId, amount, reason, sourceType, sourceId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return 0;
    throw err;
  }
  await recordActivity(userId, { xp: amount, minutes });
  return amount;
}

export async function totalXp(userId: string) {
  const r = await db.xpTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}
