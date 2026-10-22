import "server-only";
import { db } from "../db";
import { addDays, computeStreak, dayKey, localDateString, localDay } from "@/lib/dates";

export async function streakFor(userId: string, tz: string) {
  const since = addDays(localDay(tz), -400);
  const days = await db.dailyActivity.findMany({
    where: { userId, date: { gte: since }, xp: { gt: 0 } },
    select: { date: true },
  });
  return computeStreak(days.map((d) => dayKey(d.date)), localDateString(tz));
}

export async function weeklyActivity(userId: string, tz: string, days = 7) {
  const today = localDay(tz);
  const start = addDays(today, -(days - 1));
  const rows = await db.dailyActivity.findMany({ where: { userId, date: { gte: start, lte: today } } });
  const byDay = new Map(rows.map((r) => [dayKey(r.date), r]));
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i);
    const r = byDay.get(dayKey(d));
    return {
      date: dayKey(d),
      xp: r?.xp ?? 0,
      minutes: r?.minutes ?? 0,
      lessons: r?.lessonsCompleted ?? 0,
      exercises: r?.exercisesAnswered ?? 0,
      correct: r?.exercisesCorrect ?? 0,
      reviews: r?.reviews ?? 0,
      goalMet: r?.goalMet ?? false,
    };
  });
}

export async function learnerTotals(userId: string) {
  const [xp, lessons, words, mastered, conversations, speaking, readings, goals, placement, assessments] = await Promise.all([
    db.xpTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
    db.lessonProgress.count({ where: { userId, status: "COMPLETED", lesson: { kind: { not: "LEVEL_ASSESSMENT" } } } }),
    db.userVocabulary.count({ where: { userId } }),
    db.userVocabulary.count({ where: { userId, status: "MASTERED" } }),
    db.conversation.count({ where: { userId, status: "ENDED", messages: { some: { role: "USER" } } } }),
    db.speakingAttempt.count({ where: { userId } }),
    db.readingProgress.count({ where: { userId, status: "COMPLETED" } }),
    db.dailyActivity.count({ where: { userId, goalMet: true } }),
    db.assessmentAttempt.count({ where: { userId, kind: "PLACEMENT" } }),
    db.assessmentAttempt.count({ where: { userId, kind: "LEVEL", passed: true } }),
  ]);
  return {
    xp: xp._sum.amount ?? 0,
    lessonsCompleted: lessons,
    wordsSaved: words,
    wordsMastered: mastered,
    conversations,
    speakingAttempts: speaking,
    readingsCompleted: readings,
    goalsMet: goals,
    placementDone: placement,
    levelsPassed: assessments,
  };
}

/** Units in which every lesson (including the unit review) is completed. */
export async function completedUnits(userId: string) {
  const units = await db.unit.findMany({
    where: { order: { lt: 99 }, lessons: { some: { progress: { some: { userId } } } } },
    select: { id: true, lessons: { where: { status: "PUBLISHED" }, select: { id: true, progress: { where: { userId, status: "COMPLETED" }, select: { id: true } } } } },
  });
  return units.filter((u) => u.lessons.length > 0 && u.lessons.every((l) => l.progress.length > 0)).length;
}
