import "server-only";
import type { ExercisePrompt } from "@/content/types";
import { db } from "./db";

export { SKILL_NAMES as SKILL_LABEL } from "@/lib/skills";

/** First-try accuracy by skill over a period, from real exercise attempts. */
export async function skillAccuracy(userId: string, languageCode: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.$queryRaw<{ skill: string; n: bigint; correct: bigint; score: number }[]>`
    SELECT e.skill AS skill, COUNT(*)::bigint AS n, SUM(CASE WHEN a."isCorrect" THEN 1 ELSE 0 END)::bigint AS correct, AVG(a.score)::float AS score
    FROM "ExerciseAttempt" a
    JOIN "Exercise" e ON e.id = a."exerciseId"
    JOIN "Lesson" l ON l.id = e."lessonId"
    JOIN "Unit" u ON u.id = l."unitId"
    JOIN "Course" c ON c.id = u."courseId"
    WHERE a."userId" = ${userId} AND c."languageCode" = ${languageCode} AND a."createdAt" >= ${since}
      AND (a.feedback->>'status') IS DISTINCT FROM 'skipped'
    GROUP BY e.skill
  `;
  return rows.map((r) => ({ skill: r.skill, answers: Number(r.n), correct: Number(r.correct), score: r.score }));
}

export async function recentMistakes(userId: string, languageCode: string, take = 5) {
  const attempts = await db.exerciseAttempt.findMany({
    where: { userId, isCorrect: false, exercise: { lesson: { unit: { course: { languageCode } } } }, NOT: { feedback: { path: ["status"], equals: "skipped" } } },
    orderBy: { createdAt: "desc" },
    take: take * 3,
    include: { exercise: { select: { id: true, type: true, prompt: true, tags: true, lesson: { select: { slug: true, title: true } } } } },
  });
  const seen = new Set<string>();
  const out = [];
  for (const a of attempts) {
    if (seen.has(a.exerciseId)) continue;
    seen.add(a.exerciseId);
    const p = a.exercise.prompt as unknown as ExercisePrompt;
    const prompt =
      p.kind === "mc" || p.kind === "listen" || p.kind === "short" ? p.question : p.kind === "fill" ? p.sentence : p.kind === "translate" ? p.source : p.kind === "order" ? p.translation ?? "Sentence order" : p.kind === "dictation" ? "Dictation" : p.kind === "match" ? "Matching" : p.kind === "write" ? p.instruction : p.kind === "speak" ? p.text ?? p.instruction : "";
    const fb = a.feedback as { expected?: string; message?: string };
    out.push({ id: a.id, exerciseId: a.exerciseId, prompt, expected: fb.expected ?? null, lesson: a.exercise.lesson, at: a.createdAt, type: a.exercise.type });
    if (out.length >= take) break;
  }
  return out;
}

/**
 * Estimated vocabulary: lesson vocabulary from completed lessons whose vocabulary
 * is not an active focus area, plus notebook words in review/mastered state.
 * It is an estimate and labelled as such in the UI.
 */
export async function vocabularyEstimate(userId: string, languageCode: string) {
  const [completed, weakVocab, notebook] = await Promise.all([
    db.lessonProgress.findMany({ where: { userId, status: "COMPLETED", lesson: { unit: { course: { languageCode } } } }, select: { lessonId: true, lesson: { select: { slug: true } } } }),
    db.learnerWeakness.findMany({ where: { userId, languageCode, status: "ACTIVE", category: { startsWith: "vocab." } }, select: { category: true } }),
    db.userVocabulary.findMany({ where: { userId, languageCode, status: { in: ["REVIEW", "MASTERED"] } }, select: { normalizedTerm: true } }),
  ]);
  const weak = new Set(weakVocab.map((w) => w.category.replace("vocab.", "")));
  const lessonIds = completed.filter((c) => !weak.has(c.lesson.slug)).map((c) => c.lessonId);
  const items = lessonIds.length ? await db.vocabularyItem.findMany({ where: { lessonId: { in: lessonIds } }, select: { term: true } }) : [];
  const set = new Set(items.map((i) => i.term.toLowerCase()));
  for (const n of notebook) set.add(n.normalizedTerm);
  return set.size;
}
