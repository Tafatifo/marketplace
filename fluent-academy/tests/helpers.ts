import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { signUp } from "@/server/auth/service";

/** A fresh client IP per call keeps per-IP rate limits from interfering between tests. */
export const meta = () => ({ ip: `10.${rnd()}.${rnd()}.${rnd()}`, userAgent: "vitest" });
const rnd = () => Math.floor(Math.random() * 250) + 1;

/** A signed-up, onboarded learner studying French A1 (free plan). */
export async function createLearner(opts: { language?: "fr" | "es" | "de" | "en"; level?: string; premium?: boolean } = {}) {
  const language = opts.language ?? "fr";
  const email = `learner-${randomUUID()}@example.com`;
  const password = "a sufficiently long passphrase";
  const { user } = await signUp({ name: "Test Learner", email, password }, meta());
  await db.userPreferences.upsert({
    where: { userId: user.id },
    create: { userId: user.id, activeLanguage: language, onboardingCompletedAt: new Date(), timezone: "Europe/Paris", nativeLanguage: language === "en" ? "fr" : "en" },
    update: { activeLanguage: language, onboardingCompletedAt: new Date() },
  });
  await db.enrollment.create({ data: { userId: user.id, languageCode: language, levelCode: opts.level ?? "A1" } });
  if (opts.premium) {
    await db.subscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, planCode: "premium", status: "ACTIVE", provider: "simulation", currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
      update: { planCode: "premium", status: "ACTIVE" },
    });
  }
  return { user, email, password };
}
