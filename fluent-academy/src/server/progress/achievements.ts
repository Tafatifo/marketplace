import "server-only";
import { db } from "../db";
import { completedUnits, learnerTotals, streakFor } from "./stats";

/**
 * Grants any achievements whose thresholds are now met. Achievements are badges
 * only — they never award XP — so they cannot be farmed for points.
 */
export async function awardAchievements(userId: string): Promise<string[]> {
  const [achievements, owned, prefs] = await Promise.all([
    db.achievement.findMany(),
    db.userAchievement.findMany({ where: { userId }, select: { achievementCode: true } }),
    db.userPreferences.findUnique({ where: { userId }, select: { timezone: true } }),
  ]);
  const have = new Set(owned.map((o) => o.achievementCode));
  const pending = achievements.filter((a) => !have.has(a.code));
  if (!pending.length) return [];

  const [totals, streak, units] = await Promise.all([
    learnerTotals(userId),
    streakFor(userId, prefs?.timezone ?? "UTC"),
    completedUnits(userId),
  ]);
  const metric: Record<string, number> = {
    lessons: totals.lessonsCompleted,
    units,
    levels: totals.levelsPassed,
    streak: Math.max(streak.current, streak.longest),
    vocabulary: totals.wordsSaved,
    speaking: totals.speakingAttempts,
    reading: totals.readingsCompleted,
    assessment: totals.placementDone,
    goals: totals.goalsMet,
  };
  const earned: string[] = [];
  for (const a of pending) {
    let value = metric[a.category] ?? 0;
    if (a.code === "words-mastered-25") value = totals.wordsMastered;
    if (a.code.startsWith("first-conversation") || a.code.startsWith("conversations-")) value = totals.conversations;
    if (value >= a.threshold) earned.push(a.code);
  }
  if (earned.length) {
    await db.userAchievement.createMany({ data: earned.map((code) => ({ userId, achievementCode: code })), skipDuplicates: true });
  }
  return earned;
}
