import "server-only";
import { randomUUID } from "node:crypto";
import type { Exercise, Lesson, Prisma } from "@prisma/client";
import type { ExerciseAnswer, ExercisePrompt, LessonContent } from "@/content/types";
import { validateResponse, type LearnerResponse, type ValidationResult } from "@/lib/validate";
import { scheduleMistake } from "@/lib/srs";
import { localDateString } from "@/lib/dates";
import { db } from "../db";
import { badRequest, forbidden, notFound, paymentRequired } from "../http";
import { entitlementFor } from "../learner";
import { consumeQuota } from "../billing/quota";
import { awardXp, recordActivity } from "../progress/activity";
import { awardAchievements } from "../progress/achievements";
import { recordObservations, type ObservationInput } from "../learner-model/observations";
import type { ResponsePayload } from "../exercises/schemas";

export const PASS_SCORE = 0.6;

type LessonWithUnit = Lesson & { unit: { id: string; slug: string; title: string; isFree: boolean; order: number; course: { languageCode: string; levelCode: string; slug: string } } };

export async function loadLesson(slug: string): Promise<LessonWithUnit | null> {
  return db.lesson.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: { unit: { select: { id: true, slug: true, title: true, isFree: true, order: true, course: { select: { languageCode: true, levelCode: true, slug: true } } } } },
  });
}

/** Whether the learner's plan allows this lesson. */
export async function lessonAccess(userId: string, lesson: LessonWithUnit) {
  const ent = await entitlementFor(userId);
  if (lesson.kind === "LEVEL_ASSESSMENT" && !ent.isPremium) {
    return { allowed: false as const, reason: "Level assessments are part of Premium.", plan: ent.plan };
  }
  if (ent.plan.limits.freeUnitsOnly && !lesson.unit.isFree) {
    return { allowed: false as const, reason: "This unit is part of the full academy on Premium. The first units of every level are free.", plan: ent.plan };
  }
  return { allowed: true as const, plan: ent.plan, isPremium: ent.isPremium };
}

export function toPublicExercise(e: Pick<Exercise, "id" | "key" | "order" | "type" | "skill" | "prompt" | "points">) {
  return { id: e.id, key: e.key, order: e.order, type: e.type, skill: e.skill, prompt: e.prompt as unknown as ExercisePrompt, points: e.points };
}
export type PublicExercise = ReturnType<typeof toPublicExercise>;

export async function getLessonForLearner(userId: string, slug: string) {
  const lesson = await loadLesson(slug);
  if (!lesson) return null;
  const [exercises, progress, access, siblings] = await Promise.all([
    db.exercise.findMany({ where: { lessonId: lesson.id, isActive: true }, orderBy: { order: "asc" } }),
    db.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId: lesson.id } } }),
    lessonAccess(userId, lesson),
    db.lesson.findMany({ where: { unitId: lesson.unitId, status: "PUBLISHED" }, orderBy: { order: "asc" }, select: { slug: true, title: true, order: true } }),
  ]);
  const idx = siblings.findIndex((s) => s.slug === slug);
  return {
    lesson: {
      id: lesson.id,
      slug: lesson.slug,
      title: lesson.title,
      summary: lesson.summary,
      kind: lesson.kind,
      minutes: lesson.estimatedMinutes,
      objectives: lesson.objectives as string[],
      skills: lesson.skills,
      content: lesson.content as unknown as LessonContent,
      linguisticStatus: lesson.linguisticStatus,
      language: lesson.unit.course.languageCode,
      level: lesson.unit.course.levelCode,
      unit: { slug: lesson.unit.slug, title: lesson.unit.title, order: lesson.unit.order },
    },
    exercises: exercises.map(toPublicExercise),
    progress,
    access,
    nextLesson: siblings[idx + 1] ?? null,
  };
}

/** Starts (or resumes) a pass through a lesson. Counts against the daily lesson limit once per lesson per day. */
export async function startLesson(userId: string, slug: string) {
  const lesson = await loadLesson(slug);
  if (!lesson) throw notFound("Lesson not found.");
  const access = await lessonAccess(userId, lesson);
  if (!access.allowed) throw paymentRequired(access.reason);

  const existing = await db.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId: lesson.id } } });
  const prefs = await db.userPreferences.findUnique({ where: { userId }, select: { timezone: true } });
  const tz = prefs?.timezone ?? "UTC";
  const touchedToday = existing && localDateString(tz, existing.updatedAt) === localDateString(tz);
  if (!touchedToday && lesson.kind === "LESSON") {
    await consumeQuota(userId, "lesson_start", access.plan.limits.lessonsPerDay);
  }
  const sessionKey = randomUUID();
  const progress = await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId: lesson.id } },
    create: { userId, lessonId: lesson.id, status: "IN_PROGRESS", sessionKey },
    update: { sessionKey, ...(existing?.status === "COMPLETED" ? {} : { status: "IN_PROGRESS" }), currentStep: 0 },
  });
  await db.enrollment.updateMany({ where: { userId, languageCode: lesson.unit.course.languageCode }, data: { lastActiveAt: new Date() } });
  return { sessionKey, progress };
}

/** Converts the transport payload into a validator response (speech → the learner's own transcript). */
export async function resolveResponse(userId: string, payload: ResponsePayload): Promise<{ response: LearnerResponse; speechAttemptId?: string; speechConfidence?: number }> {
  if (payload.kind !== "speech") return { response: payload as LearnerResponse };
  const attempt = await db.speakingAttempt.findFirst({ where: { id: payload.attemptId, userId } });
  if (!attempt) throw badRequest("Recording not found. Please record again.");
  const words = (attempt.words as { confidence?: number }[] | null) ?? [];
  const conf = words.length ? words.reduce((n, w) => n + (w.confidence ?? 0.7), 0) / words.length : 0.7;
  return { response: { kind: "speech", transcript: attempt.transcript }, speechAttemptId: attempt.id, speechConfidence: conf };
}

function observationsFor(exercise: Exercise, lesson: { title: string; slug: string }, result: ValidationResult, response: LearnerResponse, source: ObservationInput["source"], conf?: number): ObservationInput[] {
  if (result.status === "skipped") return [];
  const outcome = result.correct ? "SUCCESS" : "ERROR";
  const evidence =
    !result.correct && result.expected
      ? `${summarizeResponse(response)} → ${result.expected}`.slice(0, 300)
      : undefined;
  const obs: ObservationInput[] = exercise.tags.map((tag) => ({
    skill: exercise.skill,
    category: tag,
    outcome,
    evidence,
    detail: (exercise.prompt as { question?: string; sentence?: string; source?: string }).question ?? (exercise.prompt as { sentence?: string }).sentence ?? (exercise.prompt as { source?: string }).source,
    source,
    sourceId: exercise.id,
    confidence: exercise.type === "SPEAKING" ? Math.min(0.9, conf ?? 0.6) : 0.8,
    label: tag.startsWith("vocab.") ? { lessonTitle: lesson.title } : undefined,
  }));
  // Words repeatedly not recognised in speaking practice become pronunciation focus areas.
  if (exercise.type === "SPEAKING" && result.alignment) {
    for (const w of result.alignment.words) {
      const key = w.word.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "");
      if (key.length < 3) continue;
      obs.push({
        skill: "pronunciation",
        category: `pron.${key}`,
        outcome: w.status === "match" || w.status === "close" ? "SUCCESS" : "ERROR",
        evidence: w.heard ? `heard “${w.heard}”` : w.status === "missing" ? "not recognised" : undefined,
        source: "SPEAKING",
        sourceId: exercise.id,
        confidence: 0.5,
        label: { word: w.word },
      });
    }
  }
  return obs;
}

function summarizeResponse(r: LearnerResponse): string {
  switch (r.kind) {
    case "text":
      return r.text.slice(0, 120);
    case "blanks":
      return r.values.join(" … ");
    case "order":
      return r.tokens.join(" ");
    case "speech":
      return `“${r.transcript.slice(0, 120)}”`;
    default:
      return "answer";
  }
}

export type AttemptMode = "lesson" | "review";

/** Validates one answer on the server, stores it, and updates the learner model. */
export async function submitAttempt(userId: string, exerciseId: string, payload: ResponsePayload, opts: { sessionKey?: string; mode: AttemptMode }) {
  const exercise = await db.exercise.findFirst({
    where: { id: exerciseId, isActive: true },
    include: { lesson: { select: { id: true, slug: true, title: true, kind: true, status: true, unit: { select: { isFree: true, slug: true, title: true, order: true, id: true, course: { select: { languageCode: true, levelCode: true, slug: true } } } } } } },
  });
  if (!exercise || exercise.lesson.status !== "PUBLISHED") throw notFound("Exercise not found.");
  if (exercise.lesson.kind === "LEVEL_ASSESSMENT") throw badRequest("Assessment answers are submitted together at the end.");
  const access = await lessonAccess(userId, { ...(exercise.lesson as unknown as LessonWithUnit) });
  if (!access.allowed && opts.mode === "lesson") throw forbidden(access.reason);

  const lang = exercise.lesson.unit.course.languageCode;
  const { response, speechConfidence } = await resolveResponse(userId, payload);
  const result = validateResponse(exercise.prompt as unknown as ExercisePrompt, exercise.answer as unknown as ExerciseAnswer, response, lang);

  await db.exerciseAttempt.create({
    data: {
      userId,
      exerciseId,
      sessionKey: opts.sessionKey ?? (opts.mode === "review" ? "review" : null),
      response: payload as unknown as Prisma.InputJsonValue,
      isCorrect: result.correct,
      score: result.score,
      feedback: result as unknown as Prisma.InputJsonValue,
    },
  });

  if (result.status !== "skipped") {
    await recordActivity(userId, { exercisesAnswered: 1, exercisesCorrect: result.correct ? 1 : 0, reviews: opts.mode === "review" ? 1 : 0 });
    await recordObservations(userId, lang, observationsFor(exercise, exercise.lesson, result, response, opts.mode === "review" ? "REVIEW" : "EXERCISE", speechConfidence));
  }

  // Mistakes deck: wrong answers come back for spaced review; review answers reschedule.
  if (result.status !== "skipped" && exercise.type !== "SPEAKING" && exercise.type !== "WRITING") {
    const existing = await db.exerciseReview.findUnique({ where: { userId_exerciseId: { userId, exerciseId } } });
    if (opts.mode === "review" && existing) {
      const next = scheduleMistake(existing, result.correct);
      if (next.graduated) await db.exerciseReview.delete({ where: { id: existing.id } });
      else await db.exerciseReview.update({ where: { id: existing.id }, data: { intervalDays: next.intervalDays, repetitions: next.repetitions, easeFactor: next.easeFactor, dueAt: next.dueAt, lastResult: result.correct } });
      if (result.correct) await awardXp(userId, 1, "REVIEW", "exercise-review", `${existing.id}:${existing.repetitions}`);
    } else if (!result.correct) {
      await db.exerciseReview.upsert({
        where: { userId_exerciseId: { userId, exerciseId } },
        create: { userId, exerciseId, languageCode: lang, dueAt: new Date(Date.now() + 86_400_000), lastResult: false },
        update: { dueAt: new Date(Date.now() + 86_400_000), intervalDays: 1, repetitions: 0, lastResult: false },
      });
    }
  }

  return {
    result,
    explanation: exercise.explanation,
    answerKey: revealAnswer(exercise),
  };
}

/** What we reveal after an answer: the accepted answer(s) and transcript — never before submission. */
function revealAnswer(e: Exercise) {
  const a = e.answer as unknown as ExerciseAnswer;
  const p = e.prompt as unknown as ExercisePrompt;
  switch (a.kind) {
    case "mc":
      return { correctIndex: a.correct, correctText: (p.kind === "mc" || p.kind === "listen" ? p.options : [])[a.correct], transcript: a.transcript };
    case "fill":
      return { blanks: a.blanks.map((b) => b[0]) };
    case "order":
      return { sentence: a.sentences[0] };
    case "match":
      return { pairs: a.pairs };
    case "translate":
      return { accepted: a.accepted.slice(0, 3) };
    case "short":
      return a.keywords?.length ? { keywords: a.keywords.map((k) => k[0]) } : { accepted: a.accepted.slice(0, 3) };
    case "dictation":
      return { text: a.text };
    case "speak":
      return { target: a.target, model: a.model };
    case "write":
      return { model: a.model };
  }
}

/**
 * Completes a lesson pass. Every exercise must have been answered (or legitimately
 * skipped) in this session; the score uses first attempts only, so retrying until
 * correct cannot inflate it.
 */
export async function completeLesson(userId: string, slug: string, sessionKey: string) {
  const lesson = await loadLesson(slug);
  if (!lesson) throw notFound("Lesson not found.");
  const progress = await db.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId: lesson.id } } });
  if (!progress || progress.sessionKey !== sessionKey) throw badRequest("This lesson session has expired. Please restart the lesson.");

  const exercises = await db.exercise.findMany({ where: { lessonId: lesson.id, isActive: true }, select: { id: true, type: true } });
  const attempts = await db.exerciseAttempt.findMany({
    where: { userId, sessionKey, exerciseId: { in: exercises.map((e) => e.id) } },
    orderBy: { createdAt: "asc" },
  });
  const first = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) if (!first.has(a.exerciseId)) first.set(a.exerciseId, a);
  const missing = exercises.filter((e) => !first.has(e.id));
  if (missing.length) throw badRequest(`Answer every exercise before finishing (${missing.length} left).`);

  const scored = exercises.filter((e) => (first.get(e.id)!.feedback as { status?: string }).status !== "skipped");
  if (scored.length < Math.ceil(exercises.length * 0.6)) throw badRequest("Too many exercises were skipped to complete this lesson.");
  const score = scored.reduce((n, e) => n + first.get(e.id)!.score, 0) / Math.max(1, scored.length);
  const passed = score >= PASS_SCORE;
  const firstCompletion = passed && progress.status !== "COMPLETED";

  const minutes = Math.max(1, Math.min(Math.round((Date.now() - progress.updatedAt.getTime()) / 60000), lesson.estimatedMinutes * 2));
  let xp = 0;
  if (passed) {
    const prefs = await db.userPreferences.findUnique({ where: { userId }, select: { timezone: true } });
    xp = firstCompletion
      ? await awardXp(userId, 10 + Math.round(20 * score), "LESSON_COMPLETE", "lesson", lesson.id, minutes)
      : await awardXp(userId, 5, "LESSON_PRACTICE", "lesson", `${lesson.id}:${localDateString(prefs?.timezone ?? "UTC")}`, minutes);
    await recordActivity(userId, { lessonsCompleted: firstCompletion ? 1 : 0 });
  } else {
    await recordActivity(userId, { minutes });
  }

  const updated = await db.lessonProgress.update({
    where: { id: progress.id },
    data: {
      lastScore: score,
      bestScore: Math.max(progress.bestScore, score),
      passes: { increment: 1 },
      xpAwarded: { increment: xp },
      ...(passed ? { status: "COMPLETED", completedAt: progress.completedAt ?? new Date() } : {}),
      sessionKey: null,
    },
  });
  const achievements = await awardAchievements(userId);
  return {
    score,
    passed,
    xp,
    firstCompletion,
    progress: updated,
    achievements,
    correct: scored.filter((e) => first.get(e.id)!.isCorrect).length,
    total: scored.length,
  };
}
