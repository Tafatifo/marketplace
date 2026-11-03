import "server-only";
import type { Prisma } from "@prisma/client";
import type { ExerciseAnswer, ExercisePrompt } from "@/content/types";
import { validateResponse, type LearnerResponse } from "@/lib/validate";
import { db } from "../db";

export const PLACEMENT_LEVELS = ["A1", "A2", "B1", "B2"] as const;
const PASS_RATIO = 0.7;

export interface PlacementLevelResult {
  level: string;
  correct: number;
  total: number;
  passed: boolean;
}

export async function placementItems(languageCode: string) {
  return db.placementItem.findMany({ where: { languageCode }, orderBy: { order: "asc" } });
}

/**
 * Scores answered placement blocks. The test is staged: a learner only sees the next
 * level after passing the current one, and the recommendation is the first level not passed.
 */
export async function scorePlacement(languageCode: string, answers: Record<string, LearnerResponse>) {
  const items = await placementItems(languageCode);
  const levels: PlacementLevelResult[] = [];
  const detail: { key: string; level: string; correct: boolean }[] = [];
  for (const level of PLACEMENT_LEVELS) {
    const block = items.filter((i) => i.levelCode === level);
    if (!block.length) continue;
    const answered = block.filter((i) => answers[i.key] !== undefined);
    if (answered.length < block.length) break;
    let correct = 0;
    for (const item of block) {
      const r = validateResponse(item.prompt as unknown as ExercisePrompt, item.answer as unknown as ExerciseAnswer, answers[item.key]!, languageCode);
      if (r.correct) correct++;
      detail.push({ key: item.key, level, correct: r.correct });
    }
    const passed = correct / block.length >= PASS_RATIO;
    levels.push({ level, correct, total: block.length, passed });
    if (!passed) break;
  }
  const failed = levels.find((l) => !l.passed);
  const availableLevels = PLACEMENT_LEVELS.filter((l) => items.some((i) => i.levelCode === l));
  const nextLevel = failed ? null : availableLevels.find((l) => !levels.some((r) => r.level === l)) ?? null;
  const recommended = failed ? failed.level : (levels.at(-1)?.level ?? "A1");
  return { levels, detail, nextLevel, recommended, complete: !nextLevel };
}

export async function savePlacement(userId: string, languageCode: string, answers: Record<string, LearnerResponse>) {
  const result = await scorePlacement(languageCode, answers);
  const total = result.levels.reduce((n, l) => n + l.total, 0);
  const correct = result.levels.reduce((n, l) => n + l.correct, 0);
  await db.assessmentAttempt.create({
    data: {
      userId,
      kind: "PLACEMENT",
      languageCode,
      levelCode: result.recommended,
      score: correct,
      maxScore: total,
      passed: true,
      result: { levels: result.levels, detail: result.detail, recommended: result.recommended } as unknown as Prisma.InputJsonValue,
    },
  });
  await db.enrollment.upsert({
    where: { userId_languageCode: { userId, languageCode } },
    create: { userId, languageCode, levelCode: result.recommended, placementLevel: result.recommended },
    update: { placementLevel: result.recommended },
  });
  return result;
}
