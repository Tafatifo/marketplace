import "server-only";
import type { UserVocabulary } from "@prisma/client";
import { compareText } from "@/lib/validate";
import { normalizeAnswer } from "@/content/text";
import { schedule } from "@/lib/srs";
import { db } from "../db";
import { conflict, notFound } from "../http";
import { consumeQuota } from "../billing/quota";
import { entitlementFor } from "../learner";
import { awardXp, recordActivity } from "../progress/activity";
import { recordObservations } from "../learner-model/observations";

export interface SaveWordInput {
  language: string;
  term: string;
  translation: string;
  example?: string;
  definition?: string;
  partOfSpeech?: string;
  notes?: string;
  sourceType: "LESSON" | "READING" | "CONVERSATION" | "MANUAL" | "SPEAKING";
  sourceId?: string;
  sourceContext?: string;
  vocabularyItemKey?: string;
}

export const normalizeTerm = (term: string, lang: string) => normalizeAnswer(term, lang).slice(0, 120);

export async function saveWord(userId: string, input: SaveWordInput) {
  const normalizedTerm = normalizeTerm(input.term, input.language);
  if (!normalizedTerm) throw conflict("Enter a word or phrase.");
  const item = input.vocabularyItemKey ? await db.vocabularyItem.findUnique({ where: { key: input.vocabularyItemKey } }) : null;
  const existing = await db.userVocabulary.findUnique({ where: { userId_languageCode_normalizedTerm: { userId, languageCode: input.language, normalizedTerm } } });
  if (existing) {
    if (existing.status === "SUSPENDED") return db.userVocabulary.update({ where: { id: existing.id }, data: { status: "LEARNING", dueAt: new Date() } });
    return existing;
  }
  return db.userVocabulary.create({
    data: {
      userId,
      languageCode: input.language,
      term: input.term.trim().slice(0, 200),
      normalizedTerm,
      translation: (item?.translation ?? input.translation).trim().slice(0, 300),
      definition: input.definition?.slice(0, 500) ?? null,
      example: (input.example ?? item?.example)?.slice(0, 500) ?? null,
      partOfSpeech: input.partOfSpeech ?? item?.partOfSpeech ?? null,
      notes: input.notes?.slice(0, 1000) ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceContext: input.sourceContext?.slice(0, 500) ?? null,
      vocabularyItemId: item?.id ?? null,
      audioKey: item?.audioKey ?? null,
      dueAt: new Date(),
    },
  });
}

export type ReviewMode = "PRODUCTION" | "RECALL" | "LISTENING" | "CONTEXT";

/** Picks a review mode that favours active recall (producing the target-language word). */
export function modeFor(card: Pick<UserVocabulary, "repetitions" | "audioKey" | "example" | "term">): ReviewMode {
  if (card.repetitions === 0) return "RECALL";
  const r = card.repetitions % 4;
  if (r === 1 && card.example && card.example.toLowerCase().includes(card.term.toLowerCase())) return "CONTEXT";
  if (r === 2 && card.audioKey) return "LISTENING";
  return "PRODUCTION";
}

export function clozeOf(example: string, term: string) {
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return example.replace(re, "_____");
}

export async function dueCards(userId: string, languageCode: string, limit = 20) {
  const cards = await db.userVocabulary.findMany({
    where: { userId, languageCode, dueAt: { lte: new Date() }, status: { not: "SUSPENDED" } },
    orderBy: [{ dueAt: "asc" }],
    take: limit,
  });
  return cards.map((c) => {
    const mode = modeFor(c);
    return {
      id: c.id,
      mode,
      // The answer is never included; the prompt depends on the mode.
      prompt:
        mode === "RECALL"
          ? { show: c.term, ask: "What does this mean?" }
          : mode === "PRODUCTION"
            ? { show: c.translation, ask: "Write it in the language you're learning." }
            : mode === "CONTEXT"
              ? { show: clozeOf(c.example!, c.term), hint: c.translation, ask: "Complete the sentence." }
              : { show: "", ask: "Type the word you hear.", audioKey: c.audioKey },
      status: c.status,
      repetitions: c.repetitions,
    };
  });
}

/** Checks a review answer on the server, schedules the next review, and records evidence. */
export async function reviewCard(userId: string, id: string, input: { mode: ReviewMode; response: string; selfGrade?: 3 | 4 | 5 }) {
  const card = await db.userVocabulary.findFirst({ where: { id, userId } });
  if (!card) throw notFound("Card not found.");
  const ent = await entitlementFor(userId);
  await consumeQuota(userId, "vocab_review", ent.plan.limits.vocabularyReviewsPerDay);

  const target = input.mode === "RECALL" ? card.translation.split(/[;,/]| or /).map((s) => s.replace(/\(.*?\)/g, "").trim()).filter(Boolean) : [card.term];
  const m = compareText(input.response, target, input.mode === "RECALL" ? "en" : card.languageCode);
  const correct = m.level !== "none";
  const grade = !correct ? 1 : m.level === "exact" ? (input.selfGrade ?? 4) : 3;
  const before = card.intervalDays;
  const next = schedule(card, grade);
  await db.$transaction([
    db.userVocabulary.update({
      where: { id: card.id },
      data: { ...next, lastReviewedAt: new Date() },
    }),
    db.vocabularyReview.create({
      data: { userId, userVocabularyId: card.id, mode: input.mode, response: input.response.slice(0, 300), correct, grade, intervalBefore: before, intervalAfter: next.intervalDays },
    }),
  ]);
  await recordActivity(userId, { reviews: 1 });
  if (correct) await awardXp(userId, 1, "REVIEW", "vocab-review", `${card.id}:${card.repetitions + card.lapses}`);
  const item = card.vocabularyItemId ? await db.vocabularyItem.findUnique({ where: { id: card.vocabularyItemId }, select: { tags: true, lesson: { select: { title: true } } } }) : null;
  if (item?.tags[0]) {
    await recordObservations(userId, card.languageCode, [
      { skill: "vocabulary", category: item.tags[0], outcome: correct ? "SUCCESS" : "ERROR", evidence: correct ? undefined : `${input.response || "(blank)"} → ${target[0]}`, source: "REVIEW", sourceId: card.id, confidence: 0.8, label: { lessonTitle: item.lesson?.title } },
    ]);
  }
  return {
    correct,
    level: m.level,
    expected: input.mode === "RECALL" ? card.translation : card.term,
    term: card.term,
    translation: card.translation,
    example: card.example,
    nextDue: next.dueAt,
    intervalDays: next.intervalDays,
    status: next.status,
  };
}
