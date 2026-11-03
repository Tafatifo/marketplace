import "server-only";
import type { Prisma } from "@prisma/client";
import type { ExerciseAnswer, ExercisePrompt } from "@/content/types";
import { validateResponse, type LearnerResponse } from "@/lib/validate";
import { db } from "../db";
import { badRequest, notFound, paymentRequired } from "../http";
import { lessonAccess, loadLesson } from "../lessons/service";
import { awardXp, recordActivity } from "../progress/activity";
import { awardAchievements } from "../progress/achievements";
import { recordObservations } from "../learner-model/observations";

export const LEVEL_PASS = 0.7;

/** Scores a whole level assessment at once (no per-item feedback during the test). */
export async function submitLevelAssessment(userId: string, slug: string, answers: Record<string, LearnerResponse>) {
  const lesson = await loadLesson(slug);
  if (!lesson || lesson.kind !== "LEVEL_ASSESSMENT") throw notFound("Assessment not found.");
  const access = await lessonAccess(userId, lesson);
  if (!access.allowed) throw paymentRequired(access.reason);
  const exercises = await db.exercise.findMany({ where: { lessonId: lesson.id, isActive: true }, orderBy: { order: "asc" } });
  if (!exercises.length) throw badRequest("This assessment has no questions yet.");
  const lang = lesson.unit.course.languageCode;

  const results = exercises.map((e) => {
    const resp = answers[e.id] ?? ({ kind: "skip" } as LearnerResponse);
    const r = validateResponse(e.prompt as unknown as ExercisePrompt, e.answer as unknown as ExerciseAnswer, resp, lang);
    return { exercise: e, result: r, response: resp };
  });
  const total = results.reduce((n, r) => n + r.exercise.points, 0);
  const earned = results.reduce((n, r) => n + r.exercise.points * (r.result.correct ? r.result.score : 0), 0);
  const score = total ? earned / total : 0;
  const passed = score >= LEVEL_PASS;

  const bySkill: Record<string, { correct: number; total: number }> = {};
  const byObjective: Record<string, { correct: number; total: number }> = {};
  for (const r of results) {
    const s = (bySkill[r.exercise.skill] ??= { correct: 0, total: 0 });
    s.total++;
    if (r.result.correct) s.correct++;
    if (r.exercise.objective) {
      const o = (byObjective[r.exercise.objective] ??= { correct: 0, total: 0 });
      o.total++;
      if (r.result.correct) o.correct++;
    }
  }

  await db.exerciseAttempt.createMany({
    data: results.map((r) => ({
      userId,
      exerciseId: r.exercise.id,
      sessionKey: `assessment:${lesson.id}`,
      response: r.response as unknown as Prisma.InputJsonValue,
      isCorrect: r.result.correct,
      score: r.result.score,
      feedback: r.result as unknown as Prisma.InputJsonValue,
    })),
  });
  await db.assessmentAttempt.create({
    data: {
      userId,
      kind: "LEVEL",
      languageCode: lang,
      levelCode: lesson.unit.course.levelCode,
      lessonId: lesson.id,
      score: earned,
      maxScore: total,
      passed,
      result: { bySkill, byObjective } as Prisma.InputJsonValue,
    },
  });
  await recordObservations(
    userId,
    lang,
    results.flatMap((r) =>
      r.result.status === "skipped"
        ? []
        : r.exercise.tags.map((t) => ({ skill: r.exercise.skill, category: t, outcome: r.result.correct ? ("SUCCESS" as const) : ("ERROR" as const), source: "ASSESSMENT" as const, sourceId: r.exercise.id, confidence: 0.8 })),
    ),
  );
  await recordActivity(userId, { exercisesAnswered: results.length, exercisesCorrect: results.filter((r) => r.result.correct).length });

  let xp = 0;
  if (passed) {
    xp = await awardXp(userId, 50, "ASSESSMENT", "level-assessment", lesson.id, 40);
    await db.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId: lesson.id } },
      create: { userId, lessonId: lesson.id, status: "COMPLETED", bestScore: score, lastScore: score, passes: 1, completedAt: new Date(), xpAwarded: xp },
      update: { status: "COMPLETED", bestScore: { set: score }, lastScore: score, passes: { increment: 1 }, completedAt: new Date() },
    });
  } else {
    await db.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId: lesson.id } },
      create: { userId, lessonId: lesson.id, status: "IN_PROGRESS", lastScore: score, bestScore: score, passes: 1 },
      update: { lastScore: score, passes: { increment: 1 } },
    });
  }
  const achievements = await awardAchievements(userId);
  const levels = ["A1", "A2", "B1", "B2"];
  const nextLevel = levels[levels.indexOf(lesson.unit.course.levelCode) + 1] ?? null;
  return {
    score,
    passed,
    xp,
    achievements,
    nextLevel,
    bySkill,
    byObjective,
    items: results.map((r) => ({
      id: r.exercise.id,
      correct: r.result.correct,
      status: r.result.status,
      expected: r.result.expected ?? null,
      explanation: r.exercise.explanation,
    })),
  };
}
