import "server-only";
import type { WeaknessStatus } from "@prisma/client";
import { db } from "../db";
import { labelFor, skillFor } from "./taxonomy";

export interface ObservationInput {
  skill: string;
  category: string;
  outcome: "ERROR" | "SUCCESS";
  detail?: string;
  evidence?: string;
  source: "EXERCISE" | "CONVERSATION" | "SPEAKING" | "READING" | "ASSESSMENT" | "REVIEW";
  sourceId?: string;
  confidence?: number;
  label?: { lessonTitle?: string; word?: string };
}

/** Evidence rules (documented on /method). */
export const WEAKNESS_RULES = {
  windowDays: 30,
  activeMinErrors: 3,
  activeMinDistinctItems: 2,
  activeMinDays: 2,
  activeMinErrorRate: 0.3,
  improvingStreak: 3,
  resolvedStreak: 6,
  dismissCooldownDays: 30,
};

interface ObsRow {
  outcome: string;
  sourceId: string | null;
  createdAt: Date;
  evidence: string | null;
  detail: string | null;
  confidence: number;
}

/** Pure classification of a category's evidence into a weakness status. */
export function classifyWeakness(rows: ObsRow[], previous: WeaknessStatus | null, dismissedAt: Date | null, now = new Date()) {
  const R = WEAKNESS_RULES;
  const windowStart = now.getTime() - R.windowDays * 86_400_000;
  const recent = rows.filter((r) => r.createdAt.getTime() >= windowStart);
  const errors = recent.filter((r) => r.outcome === "ERROR");
  const successes = recent.filter((r) => r.outcome === "SUCCESS");
  // Low-confidence evidence (e.g. a noisy recording) counts for half.
  const weight = (rs: ObsRow[]) => rs.reduce((n, r) => n + (r.confidence >= 0.6 ? 1 : 0.5), 0);
  const errorWeight = weight(errors);
  const successWeight = weight(successes);
  const distinctItems = new Set(errors.map((e) => e.sourceId ?? e.createdAt.toISOString())).size;
  const distinctDays = new Set(errors.map((e) => e.createdAt.toISOString().slice(0, 10))).size;
  const errorRate = errorWeight + successWeight > 0 ? errorWeight / (errorWeight + successWeight) : 0;

  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let streakCorrect = 0;
  for (let i = sorted.length - 1; i >= 0 && sorted[i]!.outcome === "SUCCESS"; i--) streakCorrect++;

  const meetsActive =
    errorWeight >= R.activeMinErrors &&
    distinctItems >= R.activeMinDistinctItems &&
    distinctDays >= R.activeMinDays &&
    errorRate >= R.activeMinErrorRate;

  let status: WeaknessStatus;
  if (dismissedAt && now.getTime() - dismissedAt.getTime() < R.dismissCooldownDays * 86_400_000) status = "DISMISSED";
  else if (streakCorrect >= R.resolvedStreak && (previous === "ACTIVE" || previous === "IMPROVING" || previous === "RESOLVED")) status = "RESOLVED";
  else if (streakCorrect >= R.improvingStreak && (previous === "ACTIVE" || previous === "IMPROVING")) status = "IMPROVING";
  else if (meetsActive) status = "ACTIVE";
  else if (previous === "RESOLVED" && errorWeight < R.activeMinErrors) status = "RESOLVED";
  else if (errors.length > 0) status = "EMERGING";
  else status = previous === "ACTIVE" || previous === "IMPROVING" ? "IMPROVING" : "RESOLVED";

  const score = Math.round(errorRate * Math.min(1, errorWeight / 5) * 100) / 100;
  return {
    status,
    score,
    errorCount: errors.length,
    successCount: successes.length,
    distinctItems,
    recentErrors: errors.length,
    streakCorrect,
    examples: errors
      .slice(-3)
      .reverse()
      .map((e) => ({ evidence: e.evidence, detail: e.detail, at: e.createdAt.toISOString() })),
  };
}

export async function recordObservations(userId: string, languageCode: string, items: ObservationInput[]) {
  const valid = items.filter((i) => i.category && i.category.length <= 120);
  if (!valid.length) return;
  await db.learningObservation.createMany({
    data: valid.map((i) => ({
      userId,
      languageCode,
      skill: i.skill,
      category: i.category,
      outcome: i.outcome,
      detail: i.detail?.slice(0, 500),
      evidence: i.evidence?.slice(0, 500),
      source: i.source,
      sourceId: i.sourceId,
      confidence: i.confidence ?? 0.7,
    })),
  });
  const categories = new Map(valid.map((v) => [v.category, v]));
  for (const [category, sample] of categories) {
    await refreshWeakness(userId, languageCode, category, sample.skill, sample.label);
  }
}

export async function refreshWeakness(userId: string, languageCode: string, category: string, skill: string, label?: ObservationInput["label"]) {
  const since = new Date(Date.now() - 120 * 86_400_000);
  const [rows, existing] = await Promise.all([
    db.learningObservation.findMany({
      where: { userId, languageCode, category, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { outcome: true, sourceId: true, createdAt: true, evidence: true, detail: true, confidence: true },
    }),
    db.learnerWeakness.findUnique({ where: { userId_languageCode_category: { userId, languageCode, category } } }),
  ]);
  const hasError = rows.some((r) => r.outcome === "ERROR");
  if (!existing && !hasError) return null; // Only successes so far — nothing to track.
  const c = classifyWeakness(rows, existing?.status ?? null, existing?.dismissedAt ?? null);
  const data = {
    skill: skillFor(category, skill),
    label: existing?.label && !label ? existing.label : labelFor(category, label),
    errorCount: c.errorCount,
    successCount: c.successCount,
    distinctItems: c.distinctItems,
    recentErrors: c.recentErrors,
    streakCorrect: c.streakCorrect,
    score: c.score,
    status: c.status,
    examples: c.examples,
    lastSeenAt: new Date(),
  };
  return db.learnerWeakness.upsert({
    where: { userId_languageCode_category: { userId, languageCode, category } },
    create: { userId, languageCode, category, ...data },
    update: data,
  });
}

export async function setWeaknessDismissed(userId: string, weaknessId: string, dismissed: boolean) {
  const w = await db.learnerWeakness.findFirst({ where: { id: weaknessId, userId } });
  if (!w) return null;
  if (dismissed) return db.learnerWeakness.update({ where: { id: w.id }, data: { status: "DISMISSED", dismissedAt: new Date() } });
  await db.learnerWeakness.update({ where: { id: w.id }, data: { dismissedAt: null } });
  return refreshWeakness(userId, w.languageCode, w.category, w.skill);
}
