import "server-only";
import type { Prisma } from "@prisma/client";
import type { AudioRef, QuestionDef, Speaker } from "@/content/types";
import { countWords } from "@/content/text";
import { validateResponse, type LearnerResponse } from "@/lib/validate";
import { db } from "./db";
import { badRequest, notFound, paymentRequired } from "./http";
import { entitlementFor } from "./learner";
import { awardXp, recordActivity } from "./progress/activity";
import { awardAchievements } from "./progress/achievements";
import { recordObservations } from "./learner-model/observations";
import { getLanguageModel } from "./ai/provider";
import { z } from "zod";

interface StoredQuestions {
  items: QuestionDef[];
  speakers: Speaker[];
  lineAudio: AudioRef[];
}

export async function loadPassage(slug: string, userId: string) {
  const p = await db.readingPassage.findFirst({ where: { slug, status: "PUBLISHED" } });
  if (!p) return null;
  const ent = await entitlementFor(userId);
  const locked = !p.isFree && !ent.plan.limits.premiumReadings;
  const stored = p.questions as unknown as StoredQuestions;
  const progress = await db.readingProgress.findUnique({ where: { userId_passageId: { userId, passageId: p.id } } });
  return {
    passage: {
      id: p.id,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      topic: p.topic,
      kind: p.kind,
      language: p.languageCode,
      level: p.levelCode,
      body: p.body,
      translation: p.translation,
      wordCount: p.wordCount,
      minutes: p.estimatedMinutes,
      glossary: p.glossary as { term: string; translation: string; note?: string }[],
      audio: p.audioKey ? { key: p.audioKey } : null,
      speakers: stored.speakers ?? [],
      lineAudio: stored.lineAudio ?? [],
      linguisticStatus: p.linguisticStatus,
      // Public question payloads only — answers stay on the server.
      questions: (stored.items ?? []).map((q) => ({ id: q.id, type: q.type, prompt: q.prompt })),
    },
    locked,
    progress,
  };
}

export async function submitPassageAnswers(userId: string, slug: string, answers: Record<string, LearnerResponse>) {
  const p = await db.readingPassage.findFirst({ where: { slug, status: "PUBLISHED" } });
  if (!p) throw notFound("Passage not found.");
  const ent = await entitlementFor(userId);
  if (!p.isFree && !ent.plan.limits.premiumReadings) throw paymentRequired("This passage is part of the full Premium library.");
  const items = (p.questions as unknown as StoredQuestions).items ?? [];
  if (!items.length) throw badRequest("This passage has no questions.");
  const results = items.map((q) => {
    const r = answers[q.id] ? validateResponse(q.prompt, q.answer, answers[q.id]!, p.languageCode) : { correct: false, score: 0, status: "incorrect" as const, message: "Not answered.", notes: [] };
    return { id: q.id, correct: r.correct, status: r.status, message: r.message, expected: r.expected ?? null, explanation: q.explanation };
  });
  const score = results.filter((r) => r.correct).length / results.length;
  const skill = p.kind === "LISTENING" ? "listening" : "reading";
  await recordObservations(
    userId,
    p.languageCode,
    results.map((r) => ({ skill, category: `${p.languageCode}.${skill}`, outcome: r.correct ? ("SUCCESS" as const) : ("ERROR" as const), source: "READING" as const, sourceId: `${p.id}:${r.id}`, confidence: 0.7, evidence: r.correct ? undefined : `${p.title}: ${r.expected ?? ""}` })),
  );
  const passed = score >= 0.6;
  const existing = await db.readingProgress.findUnique({ where: { userId_passageId: { userId, passageId: p.id } } });
  await db.readingProgress.upsert({
    where: { userId_passageId: { userId, passageId: p.id } },
    create: { userId, passageId: p.id, status: passed ? "COMPLETED" : "IN_PROGRESS", comprehensionScore: score, answers: answers as unknown as Prisma.InputJsonValue, completedAt: passed ? new Date() : null },
    update: { comprehensionScore: Math.max(score, existing?.comprehensionScore ?? 0), answers: answers as unknown as Prisma.InputJsonValue, ...(passed ? { status: "COMPLETED", completedAt: existing?.completedAt ?? new Date() } : {}) },
  });
  let xp = 0;
  if (passed) {
    xp = await awardXp(userId, 10, "READING", "passage", p.id, p.estimatedMinutes);
    if (xp) await recordActivity(userId, { readings: 1 });
    await awardAchievements(userId);
  }
  return { score, passed, xp, results };
}

const summaryFeedbackSchema = z.object({
  coverage: z.string().describe("Which main ideas of the text the summary covers or misses, in English"),
  language: z.string().describe("The most important language corrections, in English, quoting the learner"),
  improved: z.string().describe("A corrected, natural version of the summary at the learner's level, in the target language"),
});

/** Stores the learner's summary. With an AI model, adds coverage and language feedback. */
export async function submitSummary(userId: string, slug: string, text: string) {
  const p = await db.readingPassage.findFirst({ where: { slug, status: "PUBLISHED" } });
  if (!p) throw notFound("Passage not found.");
  const words = countWords(text);
  if (words < 10) throw badRequest("Write at least 10 words for your summary.");
  const model = getLanguageModel();
  let feedback: Record<string, unknown> = {
    kind: "checklist",
    words,
    note: "Automatic feedback isn't available without an AI provider. Compare your summary with the text: did you include who, what, where and why?",
  };
  if (model) {
    const fb = await model.generate(
      `You are a language teacher. A CEFR ${p.levelCode} learner of ${p.languageCode} summarised a text. Give brief, encouraging feedback.`,
      [{ role: "user", content: `TEXT:\n${p.body.slice(0, 4000)}\n\nLEARNER SUMMARY:\n${text}` }],
      summaryFeedbackSchema,
      { purpose: "reading-summary", maxTokens: 2000 },
    );
    feedback = { kind: "ai", words, ...fb };
  }
  await db.readingProgress.upsert({
    where: { userId_passageId: { userId, passageId: p.id } },
    create: { userId, passageId: p.id, summary: text.slice(0, 4000), summaryFeedback: feedback as Prisma.InputJsonValue },
    update: { summary: text.slice(0, 4000), summaryFeedback: feedback as Prisma.InputJsonValue },
  });
  return feedback;
}
