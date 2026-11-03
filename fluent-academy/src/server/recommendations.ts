import "server-only";
import { db } from "./db";
import { courseMap } from "./lessons/course-map";

export type RecommendationKind = "lesson" | "review" | "practice" | "reading" | "listening" | "coach" | "speaking" | "placement" | "assessment";

export interface Recommendation {
  key: string;
  kind: RecommendationKind;
  title: string;
  description: string;
  reason: string;
  href: string;
  priority: number;
  dismissible: boolean;
}

const CEFR = ["A1", "A2", "B1", "B2"];

/**
 * Transparent, rule-based recommendations. Each one states the evidence behind it.
 * Focus areas only count once they are ACTIVE (repeated evidence — see learner-model/observations.ts).
 */
export async function recommendationsFor(userId: string, languageCode: string, levelCode: string): Promise<Recommendation[]> {
  const now = new Date();
  const [map, vocabDue, mistakesDue, weaknesses, dismissed, placementCount, readDone, prefs] = await Promise.all([
    courseMap(userId, languageCode, levelCode),
    db.userVocabulary.count({ where: { userId, languageCode, dueAt: { lte: now }, status: { not: "SUSPENDED" } } }),
    db.exerciseReview.count({ where: { userId, languageCode, dueAt: { lte: now } } }),
    db.learnerWeakness.findMany({ where: { userId, languageCode, status: "ACTIVE" }, orderBy: { score: "desc" }, take: 5 }),
    db.dismissedRecommendation.findMany({ where: { userId, expiresAt: { gt: now } }, select: { recKey: true } }),
    db.assessmentAttempt.count({ where: { userId, languageCode, kind: "PLACEMENT" } }),
    db.readingProgress.findMany({ where: { userId, status: "COMPLETED" }, select: { passageId: true } }),
    db.userPreferences.findUnique({ where: { userId }, select: { focusAreas: true, learningObjective: true } }),
  ]);
  const hidden = new Set(dismissed.map((d) => d.recKey));
  const recs: Recommendation[] = [];

  if (map?.next) {
    const n = map.next;
    recs.push({
      key: `lesson:${n.slug}`,
      kind: n.kind === "LEVEL_ASSESSMENT" ? "assessment" : "lesson",
      title: n.status === "IN_PROGRESS" ? `Resume: ${n.title}` : n.title,
      description: n.summary,
      reason: n.kind === "UNIT_REVIEW" ? "You've finished this unit's lessons — the review consolidates them." : n.kind === "LEVEL_ASSESSMENT" ? `You've completed the ${levelCode} units. The assessment confirms the level.` : `Next in the ${levelCode} course sequence.`,
      href: n.kind === "LEVEL_ASSESSMENT" ? `/assessments/${n.slug}` : `/learn/${n.slug}`,
      priority: 100,
      dismissible: false,
    });
  }

  if (vocabDue + mistakesDue > 0) {
    recs.push({
      key: `review:${now.toISOString().slice(0, 10)}`,
      kind: "review",
      title: `Review ${vocabDue + mistakesDue} item${vocabDue + mistakesDue === 1 ? "" : "s"}`,
      description: [vocabDue ? `${vocabDue} word${vocabDue === 1 ? "" : "s"}` : null, mistakesDue ? `${mistakesDue} earlier mistake${mistakesDue === 1 ? "" : "s"}` : null].filter(Boolean).join(" and ") + " due today.",
      reason: "Spaced review brings items back just before you're likely to forget them.",
      href: "/review",
      priority: 90,
      dismissible: false,
    });
  }

  // Targeted practice for active focus areas.
  for (const w of weaknesses.slice(0, 3)) {
    const evidence = `${w.errorCount} error${w.errorCount === 1 ? "" : "s"} on ${w.distinctItems} different item${w.distinctItems === 1 ? "" : "s"} in the last 30 days`;
    if (w.category.startsWith("pron.")) {
      recs.push({
        key: `weak:${w.category}`,
        kind: "speaking",
        title: w.label,
        description: "Listen to the model, then record yourself saying it in a few sentences.",
        reason: `Speech recognition missed this word repeatedly (${w.errorCount} times). Recognition can also fail because of noise or the microphone.`,
        href: `/speaking?focus=${encodeURIComponent(w.category)}`,
        priority: 70 + w.score * 10,
        dismissible: true,
      });
      continue;
    }
    const lesson = w.category.startsWith("vocab.")
      ? await db.lesson.findUnique({ where: { slug: w.category.slice(6) }, select: { slug: true, title: true } })
      : await db.lesson.findFirst({ where: { grammarTags: { has: w.category }, status: "PUBLISHED", unit: { course: { languageCode } } }, orderBy: [{ unit: { course: { level: { order: "asc" } } } }, { unit: { order: "asc" } }, { order: "asc" }], select: { slug: true, title: true } });
    recs.push({
      key: `weak:${w.category}`,
      kind: "practice",
      title: `Focus: ${w.label}`,
      description: lesson ? `Targeted practice, then revisit “${lesson.title}”.` : "A short targeted practice set.",
      reason: `${evidence}.`,
      href: `/review?focus=${encodeURIComponent(w.category)}`,
      priority: 75 + w.score * 15,
      dismissible: true,
    });
  }

  if (!placementCount) {
    const hasPlacement = await db.placementItem.count({ where: { languageCode } });
    if (hasPlacement) {
      recs.push({
        key: `placement:${languageCode}`,
        kind: "placement",
        title: "Check your level",
        description: "A 10-minute adaptive check of grammar, vocabulary, reading and listening.",
        reason: "Your level is self-assessed. A quick check makes sure lessons aren't too easy or too hard.",
        href: `/onboarding/placement?lang=${languageCode}`,
        priority: 60,
        dismissible: true,
      });
    }
  }

  // A reading or listening passage at the learner's level.
  const lvlIdx = CEFR.indexOf(levelCode);
  const passage = await db.readingPassage.findFirst({
    where: {
      languageCode,
      levelCode: { in: CEFR.slice(Math.max(0, lvlIdx - 1), lvlIdx + 1) },
      status: "PUBLISHED",
      id: { notIn: readDone.map((r) => r.passageId) },
      ...(weaknesses.some((w) => w.skill === "listening") || prefs?.focusAreas.includes("listening") ? { kind: "LISTENING" as const } : {}),
    },
    orderBy: [{ levelCode: "desc" }, { createdAt: "asc" }],
  });
  if (passage) {
    const listening = passage.kind === "LISTENING";
    recs.push({
      key: `passage:${passage.slug}`,
      kind: listening ? "listening" : "reading",
      title: `${listening ? "Listen" : "Read"}: ${passage.title}`,
      description: passage.summary,
      reason: listening && weaknesses.some((w) => w.skill === "listening") ? "Listening is one of your current focus areas." : `Graded at ${passage.levelCode}, close to your level.`,
      href: `/${listening ? "listening" : "reading"}/${passage.slug}`,
      priority: 50,
      dismissible: true,
    });
  }

  // A coach scenario matched to level and focus areas.
  const scenarios = await db.scenario.findMany({ orderBy: { sortOrder: "asc" } });
  const fitting = scenarios.filter((s) => CEFR.indexOf(s.minLevel) <= lvlIdx && CEFR.indexOf(s.maxLevel) >= lvlIdx && (s.openers as Record<string, unknown>)[languageCode]);
  const focusTags = new Set(weaknesses.map((w) => w.category));
  const targeted = fitting.find((s) => s.focusTags.some((t) => focusTags.has(t)));
  const recentConvs = await db.conversation.findMany({ where: { userId, languageCode }, orderBy: { startedAt: "desc" }, take: 5, select: { scenarioSlug: true } });
  const scenario = targeted ?? fitting.find((s) => !recentConvs.some((c) => c.scenarioSlug === s.slug)) ?? fitting[0];
  if (scenario) {
    recs.push({
      key: `coach:${scenario.slug}`,
      kind: "coach",
      title: `Conversation: ${scenario.title}`,
      description: scenario.description,
      reason: targeted ? `This scenario practises ${weaknesses.find((w) => scenario.focusTags.includes(w.category))?.label}, one of your focus areas.` : "Regular conversation practice turns what you've learned into speaking.",
      href: `/coach?scenario=${scenario.slug}`,
      priority: 55 + (targeted ? 15 : 0),
      dismissible: true,
    });
  }

  return recs.filter((r) => !hidden.has(r.key)).sort((a, b) => b.priority - a.priority);
}

export async function dismissRecommendation(userId: string, recKey: string, days = 7) {
  await db.dismissedRecommendation.upsert({
    where: { userId_recKey: { userId, recKey } },
    create: { userId, recKey, expiresAt: new Date(Date.now() + days * 86_400_000) },
    update: { expiresAt: new Date(Date.now() + days * 86_400_000) },
  });
}
