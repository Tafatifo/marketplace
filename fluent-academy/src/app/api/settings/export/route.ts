import { db } from "@/server/db";
import { apiUser } from "@/server/auth/current";
import { route } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";

/** Exports all of the learner's personal data as JSON (data portability). */
export const GET = route(async () => {
  const user = await apiUser();
  await enforceRateLimit(`export:${user.id}`, 5, 3600, "Exports are limited to a few per hour.");
  const id = user.id;
  const [account, preferences, enrollments, lessonProgress, attempts, assessments, conversations, observations, weaknesses, vocabulary, reviews, speaking, reading, activity, xp, achievements, subscription] = await Promise.all([
    db.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true } }),
    db.userPreferences.findUnique({ where: { userId: id } }),
    db.enrollment.findMany({ where: { userId: id } }),
    db.lessonProgress.findMany({ where: { userId: id }, include: { lesson: { select: { slug: true, title: true } } } }),
    db.exerciseAttempt.findMany({ where: { userId: id }, include: { exercise: { select: { key: true } } } }),
    db.assessmentAttempt.findMany({ where: { userId: id } }),
    db.conversation.findMany({ where: { userId: id }, include: { messages: true } }),
    db.learningObservation.findMany({ where: { userId: id } }),
    db.learnerWeakness.findMany({ where: { userId: id } }),
    db.userVocabulary.findMany({ where: { userId: id } }),
    db.vocabularyReview.findMany({ where: { userId: id } }),
    db.speakingAttempt.findMany({ where: { userId: id }, select: { id: true, languageCode: true, targetText: true, transcript: true, provider: true, matchScore: true, pronunciation: true, words: true, feedback: true, createdAt: true, audioExpiresAt: true } }),
    db.readingProgress.findMany({ where: { userId: id }, include: { passage: { select: { slug: true, title: true } } } }),
    db.dailyActivity.findMany({ where: { userId: id } }),
    db.xpTransaction.findMany({ where: { userId: id } }),
    db.userAchievement.findMany({ where: { userId: id } }),
    db.subscription.findUnique({ where: { userId: id }, select: { planCode: true, status: true, provider: true, interval: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } }),
  ]);
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), note: "Voice recordings are not included in this file; they can be downloaded individually from Speaking practice.", account, preferences, enrollments, lessonProgress, attempts, assessments, conversations, observations, weaknesses, vocabulary, reviews, speaking, reading, activity, xp, achievements, subscription }, null, 2);
  return new Response(body, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="fluent-academy-export-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
});
