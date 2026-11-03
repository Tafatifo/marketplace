import "server-only";
import { db } from "./db";
import { toPublicExercise } from "./lessons/service";
import { dueCards } from "./vocabulary/service";
import { labelFor } from "./learner-model/taxonomy";

/** Builds today's review queue: due vocabulary, due mistakes, or a targeted focus-area set. */
export async function reviewQueue(userId: string, languageCode: string, focus?: string) {
  if (focus) {
    const touched = await db.lessonProgress.findMany({ where: { userId, lesson: { unit: { course: { languageCode } } } }, select: { lessonId: true } });
    const exercises = await db.exercise.findMany({
      where: {
        isActive: true,
        tags: { has: focus },
        type: { notIn: ["SPEAKING", "WRITING"] },
        lesson: { status: "PUBLISHED", kind: { not: "LEVEL_ASSESSMENT" }, ...(touched.length ? { id: { in: touched.map((t) => t.lessonId) } } : { unit: { course: { languageCode } } }) },
      },
      take: 40,
    });
    // Mix exercises the learner hasn't seen recently first.
    const recent = new Set((await db.exerciseAttempt.findMany({ where: { userId, exerciseId: { in: exercises.map((e) => e.id) }, createdAt: { gte: new Date(Date.now() - 2 * 86_400_000) } }, select: { exerciseId: true } })).map((a) => a.exerciseId));
    const ordered = [...exercises.filter((e) => !recent.has(e.id)), ...exercises.filter((e) => recent.has(e.id))].slice(0, 10);
    return { title: `Focus: ${labelFor(focus)}`, items: ordered.map((e) => ({ kind: "exercise" as const, exercise: toPublicExercise(e) })) };
  }
  const [cards, mistakes] = await Promise.all([
    dueCards(userId, languageCode, 20),
    db.exerciseReview.findMany({ where: { userId, languageCode, dueAt: { lte: new Date() }, exercise: { isActive: true } }, orderBy: { dueAt: "asc" }, take: 10, include: { exercise: true } }),
  ]);
  const items = [
    ...cards.map((c) => ({ kind: "vocab" as const, card: c })),
    ...mistakes.map((m) => ({ kind: "exercise" as const, exercise: toPublicExercise(m.exercise) })),
  ];
  const v = items.filter((i) => i.kind === "vocab");
  const e = items.filter((i) => i.kind === "exercise");
  const mixed: typeof items = [];
  while (v.length || e.length) {
    if (v.length) mixed.push(v.shift()!);
    if (v.length) mixed.push(v.shift()!);
    if (e.length) mixed.push(e.shift()!);
  }
  return { title: "Today's review", items: mixed };
}
