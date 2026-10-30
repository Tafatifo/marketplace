import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getPlan, type PlanInfo } from "./billing/plans";
import { requireUser } from "./auth/current";
import type { SessionUser } from "./auth/session";

export interface LearnerContext {
  user: SessionUser;
  prefs: NonNullable<Awaited<ReturnType<typeof loadPrefs>>>;
  enrollment: Awaited<ReturnType<typeof db.enrollment.findFirst>>;
  enrollments: Awaited<ReturnType<typeof db.enrollment.findMany>>;
  plan: PlanInfo;
  isPremium: boolean;
  subscription: Awaited<ReturnType<typeof db.subscription.findUnique>>;
}

async function loadPrefs(userId: string) {
  return db.userPreferences.upsert({ where: { userId }, create: { userId }, update: {} });
}

/** Resolves the plan a user is entitled to. Entitlements come only from the Subscription row,
 *  which is written by verified payment webhooks (or the development simulator). */
export async function entitlementFor(userId: string) {
  const subscription = await db.subscription.findUnique({ where: { userId } });
  const active =
    subscription &&
    subscription.planCode !== "free" &&
    (subscription.status === "ACTIVE" || subscription.status === "TRIALING" || subscription.status === "PAST_DUE") &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd.getTime() > Date.now() - 3 * 86_400_000);
  const plan = await getPlan(active ? subscription!.planCode : "free");
  return { subscription, plan, isPremium: Boolean(active) };
}

export const loadLearnerContext = cache(async (user: SessionUser): Promise<LearnerContext> => {
  const [prefs, enrollments, ent] = await Promise.all([
    loadPrefs(user.id),
    db.enrollment.findMany({ where: { userId: user.id }, orderBy: { lastActiveAt: "desc" } }),
    entitlementFor(user.id),
  ]);
  const enrollment = enrollments.find((e) => e.languageCode === prefs.activeLanguage) ?? enrollments[0] ?? null;
  return { user, prefs, enrollment, enrollments, plan: ent.plan, isPremium: ent.isPremium, subscription: ent.subscription };
});

/** For pages inside the learner app: signed in, onboarded, with an active language. */
export async function requireLearner(nextPath?: string) {
  const user = await requireUser(nextPath);
  const ctx = await loadLearnerContext(user);
  if (!ctx.prefs.onboardingCompletedAt || !ctx.enrollment) redirect("/onboarding");
  return ctx as LearnerContext & { enrollment: NonNullable<LearnerContext["enrollment"]> };
}
