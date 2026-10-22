import "server-only";
import type { Conversation, ConversationMessage, Prisma, Scenario } from "@prisma/client";
import type { ScenarioTurn } from "@/content/types";
import { LANGUAGE_META } from "@/content/voices";
import { nativeLanguageName } from "@/lib/languages";
import { db } from "../db";
import { badRequest, conflict, forbidden, notFound, paymentRequired } from "../http";
import { enforceRateLimit } from "../rate-limit";
import { consumeQuota } from "../billing/quota";
import { entitlementFor } from "../learner";
import { awardXp, recordActivity } from "../progress/activity";
import { awardAchievements } from "../progress/achievements";
import { recordObservations } from "../learner-model/observations";
import { labelFor, taxonomyEntries } from "../learner-model/taxonomy";
import { getLanguageModel, type ChatTurn } from "../ai/provider";
import { practiceReview, practiceTurn } from "./practice-engine";
import { reviewSchema, tutorTurnSchema, type SessionReview, type TutorTurn } from "./schemas";
import { reviewSystemPrompt, tutorSystemPrompt, type CoachContext } from "./prompts";

const CEFR = ["A1", "A2", "B1", "B2"];
export const MAX_MESSAGE_CHARS = 800;
const HISTORY_LIMIT = 30;

function scenarioFits(s: Scenario, level: string, lang: string) {
  const i = CEFR.indexOf(level);
  return CEFR.indexOf(s.minLevel) <= i && CEFR.indexOf(s.maxLevel) >= i && Boolean((s.openers as Record<string, unknown>)[lang]);
}

export async function listScenarios(languageCode: string, levelCode: string) {
  const all = await db.scenario.findMany({ orderBy: { sortOrder: "asc" } });
  return all
    .filter((s) => (s.openers as Record<string, unknown>)[languageCode])
    .map((s) => ({ ...s, fits: scenarioFits(s, levelCode, languageCode) }));
}

async function buildContext(userId: string, conv: Pick<Conversation, "languageCode" | "levelCode" | "correctionMode" | "context">, scenario: Scenario): Promise<CoachContext> {
  const [prefs, enrollment, weaknesses] = await Promise.all([
    db.userPreferences.findUnique({ where: { userId } }),
    db.enrollment.findUnique({ where: { userId_languageCode: { userId, languageCode: conv.languageCode } } }),
    db.learnerWeakness.findMany({ where: { userId, languageCode: conv.languageCode, status: "ACTIVE" }, orderBy: { score: "desc" }, take: 6 }),
  ]);
  // Current course position: the lesson in progress, or the next one.
  const current =
    (await db.lessonProgress.findFirst({
      where: { userId, status: "IN_PROGRESS", lesson: { kind: "LESSON", unit: { course: { languageCode: conv.languageCode } } } },
      orderBy: { updatedAt: "desc" },
      select: { lesson: { select: { id: true, title: true, grammarTags: true } } },
    }))?.lesson ??
    (await db.lessonProgress.findFirst({
      where: { userId, status: "COMPLETED", lesson: { kind: "LESSON", unit: { course: { languageCode: conv.languageCode } } } },
      orderBy: { completedAt: "desc" },
      select: { lesson: { select: { id: true, title: true, grammarTags: true } } },
    }))?.lesson;
  const vocab = current ? await db.vocabularyItem.findMany({ where: { lessonId: current.id }, select: { term: true }, take: 25 }) : [];
  const ctx = (conv.context ?? {}) as { passageSlug?: string };
  const passage = ctx.passageSlug ? await db.readingPassage.findUnique({ where: { slug: ctx.passageSlug }, select: { title: true, body: true } }) : null;
  const roles = scenario.roles as { tutor: string; learner: string };
  return {
    targetLanguage: LANGUAGE_META[conv.languageCode]?.name ?? conv.languageCode,
    targetCode: conv.languageCode,
    level: conv.levelCode,
    difficultyBias: enrollment?.difficultyBias ?? 0,
    nativeLanguage: nativeLanguageName(prefs?.nativeLanguage ?? "en"),
    explainInNative: prefs?.explainInNative ?? true,
    correctionMode: conv.correctionMode,
    scenario: { slug: scenario.slug, title: scenario.title, description: scenario.description, goals: scenario.goals as string[], tutorRole: roles.tutor, learnerRole: roles.learner },
    courseFocus: { lessonTitle: current?.title, vocabulary: vocab.map((v) => v.term), grammar: (current?.grammarTags ?? []).map((t) => labelFor(t)) },
    weaknesses: weaknesses.map((w) => w.label),
    taxonomy: taxonomyEntries(conv.languageCode).map((t) => ({ key: t.key, label: t.label })),
    passage: passage ? { title: passage.title, text: passage.body } : undefined,
    objective: prefs?.learningObjective,
  };
}

export async function startConversation(
  userId: string,
  input: { scenarioSlug: string; correctionMode?: "GENTLE" | "BALANCED" | "INTENSIVE"; passageSlug?: string },
) {
  const [prefs, ent] = await Promise.all([db.userPreferences.findUnique({ where: { userId } }), entitlementFor(userId)]);
  const languageCode = prefs?.activeLanguage;
  if (!languageCode) throw badRequest("Choose a language first.");
  const enrollment = await db.enrollment.findUnique({ where: { userId_languageCode: { userId, languageCode } } });
  if (!enrollment) throw badRequest("You're not enrolled in this language.");
  const scenario = await db.scenario.findUnique({ where: { slug: input.scenarioSlug } });
  if (!scenario || !(scenario.openers as Record<string, unknown>)[languageCode]) throw notFound("Scenario not found for this language.");
  if (!scenario.isFree && !ent.isPremium && ent.plan.limits.freeUnitsOnly) {
    throw paymentRequired("This scenario is part of Premium. Free scenarios are marked in the list.");
  }
  await enforceRateLimit(`conv-start:${userId}`, 20, 3600, "You've started many conversations recently. Please wait a little.");
  await consumeQuota(userId, "ai_conversation", ent.plan.limits.conversationsPerDay);

  const model = getLanguageModel();
  const opener = (scenario.openers as Record<string, { text: string; translation?: string }>)[languageCode]!;
  const passage = input.passageSlug ? await db.readingPassage.findUnique({ where: { slug: input.passageSlug }, select: { slug: true, title: true } }) : null;
  const vocabulary = ((scenario.vocabulary as Record<string, { term: string; translation: string }[]>)[languageCode] ?? []).slice(0, 8);

  const conv = await db.conversation.create({
    data: {
      userId,
      languageCode,
      levelCode: enrollment.levelCode,
      scenarioSlug: scenario.slug,
      correctionMode: input.correctionMode ?? prefs?.correctionMode ?? "BALANCED",
      provider: model?.provider ?? "practice",
      model: model?.model ?? null,
      isPractice: !model,
      title: passage ? `${scenario.title}: ${passage.title}` : scenario.title,
      context: { passageSlug: passage?.slug ?? null, vocabulary } as Prisma.InputJsonValue,
    },
  });

  // Opening line: from the scenario (both modes), so the first turn is instant and predictable.
  let openerText = opener.text;
  let openerTranslation = opener.translation ?? null;
  if (passage) {
    const intros: Record<string, string> = {
      fr: `Tu viens de lire « ${passage.title} ». Qu'est-ce que tu en as pensé ?`,
      es: `Acabas de leer «${passage.title}». ¿Qué te ha parecido?`,
      de: `Du hast gerade „${passage.title}“ gelesen. Wie fandest du den Text?`,
      en: `You've just read "${passage.title}". What did you think of it?`,
    };
    openerText = intros[languageCode] ?? openerText;
    openerTranslation = `You've just read "${passage.title}". What did you think of it?`;
  }
  await db.conversationMessage.create({
    data: { conversationId: conv.id, role: "ASSISTANT", content: openerText, translation: openerTranslation, vocabulary: vocabulary.slice(0, 3) as Prisma.InputJsonValue },
  });
  await db.enrollment.update({ where: { id: enrollment.id }, data: { lastActiveAt: new Date() } });
  return conv;
}

async function loadOwned(userId: string, conversationId: string) {
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!conv || conv.userId !== userId) throw notFound("Conversation not found.");
  return conv;
}

export async function sendMessage(userId: string, conversationId: string, text: string) {
  const content = text.trim();
  if (!content) throw badRequest("Write a message first.");
  if (content.length > MAX_MESSAGE_CHARS) throw badRequest(`Keep messages under ${MAX_MESSAGE_CHARS} characters.`);
  await enforceRateLimit(`conv-msg:${userId}`, 12, 60, "You're sending messages very quickly. Please slow down a little.");
  const conv = await loadOwned(userId, conversationId);
  if (conv.status !== "ACTIVE") throw conflict("This conversation has ended. Start a new one to keep practising.");
  const ent = await entitlementFor(userId);
  const userCount = conv.messages.filter((m) => m.role === "USER").length;
  const limit = ent.plan.limits.messagesPerConversation;
  if (limit !== null && userCount >= limit) {
    throw paymentRequired(`You've reached the ${limit}-message limit for one conversation on your plan. End this conversation to get your review.`);
  }
  await consumeQuota(userId, "ai_message", null);

  const scenario = await db.scenario.findUnique({ where: { slug: conv.scenarioSlug } });
  if (!scenario) throw notFound("Scenario not found.");
  const userMsg = await db.conversationMessage.create({ data: { conversationId, role: "USER", content } });

  let turn: TutorTurn;
  let finished = false;
  const model = conv.isPractice ? null : getLanguageModel();
  if (!conv.isPractice && !model) throw forbidden("The AI coach is no longer configured. Start a new conversation in practice mode.");

  if (model) {
    const ctx = await buildContext(userId, conv, scenario);
    const history: ChatTurn[] = [...conv.messages, userMsg]
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content }));
    // The API expects the first message to come from the user.
    if (history[0]?.role === "assistant") history.unshift({ role: "user", content: "(The learner opens the conversation.)" });
    try {
      turn = await model.generate(tutorSystemPrompt(ctx), history, tutorTurnSchema, { purpose: "coach-turn", maxTokens: 2000 });
    } catch (err) {
      await db.conversationMessage.delete({ where: { id: userMsg.id } }).catch(() => {});
      throw err;
    }
  } else {
    const script = ((scenario.mockScript as unknown as Record<string, ScenarioTurn[]>)[conv.languageCode] ?? []) as ScenarioTurn[];
    const vocab = ((conv.context as { vocabulary?: { term: string; translation: string }[] })?.vocabulary ?? []).slice(3);
    const t = practiceTurn({ language: conv.languageCode, script, userTurns: userCount + 1, text: content, vocabulary: vocab, goals: scenario.goals as string[] });
    finished = t.finished;
    turn = t;
  }

  const corrections = turn.corrections.filter((c) => c.original && c.corrected).slice(0, 8);
  await db.conversationMessage.update({ where: { id: userMsg.id }, data: { corrections: corrections as unknown as Prisma.InputJsonValue } });
  const reply = await db.conversationMessage.create({
    data: {
      conversationId,
      role: "ASSISTANT",
      content: turn.reply,
      translation: turn.replyTranslation || null,
      vocabulary: turn.vocabulary.slice(0, 4) as unknown as Prisma.InputJsonValue,
      meta: { hint: turn.hint, goalsCompleted: turn.goalsCompleted, scriptFinished: finished } as Prisma.InputJsonValue,
    },
  });

  // Corrections become learner observations (AI-judged evidence carries moderate confidence).
  const known = new Set(taxonomyEntries(conv.languageCode).map((t) => t.key));
  const obs = corrections
    .filter((c) => known.has(c.category))
    .map((c) => ({
      skill: "grammar",
      category: c.category,
      outcome: "ERROR" as const,
      evidence: `${c.original} → ${c.corrected}`,
      detail: c.explanation,
      source: "CONVERSATION" as const,
      sourceId: userMsg.id,
      confidence: conv.isPractice ? 0.7 : 0.6,
    }));
  if (obs.length) await recordObservations(userId, conv.languageCode, obs);

  return { userMessage: { ...userMsg, corrections }, reply, finished };
}

export async function endConversation(userId: string, conversationId: string) {
  const conv = await loadOwned(userId, conversationId);
  if (conv.status === "ENDED" && conv.review) return conv;
  const userMessages = conv.messages.filter((m) => m.role === "USER");
  const scenario = await db.scenario.findUnique({ where: { slug: conv.scenarioSlug } });
  if (!scenario) throw notFound("Scenario not found.");
  const scenarios = (await listScenarios(conv.languageCode, conv.levelCode)).filter((s) => s.fits);
  const nextFallback = scenarios.find((s) => s.slug !== conv.scenarioSlug)?.slug ?? conv.scenarioSlug;

  let review: SessionReview | null = null;
  let reviewSource: "ai" | "practice" | "none" = "none";
  if (userMessages.length > 0) {
    const model = conv.isPractice ? null : getLanguageModel();
    if (model) {
      const ctx = await buildContext(userId, conv, scenario);
      const transcript = conv.messages.map((m) => `${m.role === "USER" ? "LEARNER" : "TUTOR"}: ${m.content}`).join("\n");
      review = await model.generate(
        reviewSystemPrompt(ctx, scenarios.map((s) => ({ slug: s.slug, title: s.title, level: `${s.minLevel}–${s.maxLevel}` }))),
        [{ role: "user", content: `Conversation transcript:\n${transcript}\n\nWrite the structured review.` }],
        reviewSchema,
        { purpose: "coach-review", maxTokens: 6000, effort: "medium" },
      );
      if (!scenarios.some((s) => s.slug === review!.suggestedNextScenario)) review.suggestedNextScenario = nextFallback;
      reviewSource = "ai";
    } else {
      const corrections = userMessages.flatMap((m) => (m.corrections as unknown as TutorTurn["corrections"]) ?? []);
      const vocab = (conv.context as { vocabulary?: { term: string; translation: string }[] })?.vocabulary ?? [];
      review = practiceReview({ scenarioTitle: scenario.title, userMessages: userMessages.map((m) => m.content), corrections, vocabulary: vocab, nextScenario: nextFallback });
      reviewSource = "practice";
    }
  }

  // Map recommended categories to lessons that teach them.
  const recommendedLessons = review?.recommendedCategories.length
    ? await db.lesson.findMany({
        where: { status: "PUBLISHED", grammarTags: { hasSome: review.recommendedCategories }, unit: { course: { languageCode: conv.languageCode } } },
        select: { slug: true, title: true },
        take: 3,
      })
    : [];

  const updated = await db.conversation.update({
    where: { id: conv.id },
    data: {
      status: "ENDED",
      endedAt: new Date(),
      review: review ? ({ ...review, source: reviewSource, recommendedLessons } as unknown as Prisma.InputJsonValue) : undefined,
    },
  });

  if (userMessages.length >= 3) {
    const words = userMessages.reduce((n, m) => n + m.content.split(/\s+/).length, 0);
    const minutes = Math.max(1, Math.round((Date.now() - conv.startedAt.getTime()) / 60000));
    await awardXp(userId, Math.min(20, 5 + Math.floor(words / 10)), "CONVERSATION", "conversation", conv.id, Math.min(minutes, 45));
    await recordActivity(userId, { conversations: 1 });
    if (review) {
      const delta = review.difficultyAdjustment === "harder" ? 0.25 : review.difficultyAdjustment === "easier" ? -0.25 : 0;
      if (delta) {
        const e = await db.enrollment.findUnique({ where: { userId_languageCode: { userId, languageCode: conv.languageCode } } });
        if (e) await db.enrollment.update({ where: { id: e.id }, data: { difficultyBias: Math.max(-1, Math.min(1, e.difficultyBias + delta)) } });
      }
    }
    await awardAchievements(userId);
  }
  return updated;
}

export function serializeMessage(m: ConversationMessage) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    translation: m.translation,
    corrections: (m.corrections as unknown as TutorTurn["corrections"]) ?? [],
    vocabulary: (m.vocabulary as unknown as { term: string; translation: string }[]) ?? [],
    hint: (m.meta as { hint?: string })?.hint ?? null,
    createdAt: m.createdAt,
  };
}
