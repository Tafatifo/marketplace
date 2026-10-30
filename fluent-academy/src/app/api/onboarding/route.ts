import { z } from "zod";
import { db } from "@/server/db";
import { apiUser } from "@/server/auth/current";
import { badRequest, json, parseJson, route } from "@/server/http";
import { DAILY_GOALS, FOCUS_AREAS, NATIVE_LANGUAGES, OBJECTIVES } from "@/lib/languages";
import { safeTimeZone } from "@/lib/dates";
import { awardAchievements } from "@/server/progress/achievements";
import { COURSE_LANGUAGES } from "@/content/types";

const schema = z.object({
  nativeLanguage: z.enum(NATIVE_LANGUAGES.map(([c]) => c) as [string, ...string[]]),
  targetLanguage: z.enum(COURSE_LANGUAGES),
  level: z.enum(["A1", "A2", "B1", "B2"]),
  objective: z.enum(OBJECTIVES.map(([c]) => c) as [string, ...string[]]),
  dailyGoalMinutes: z.number().int().refine((m) => DAILY_GOALS.some((g) => g.minutes === m), "Choose a daily goal."),
  focusAreas: z.array(z.enum(FOCUS_AREAS.map(([c]) => c) as [string, ...string[]])).max(7),
  timezone: z.string().max(64).optional(),
  takePlacement: z.boolean().default(false),
});

export const POST = route(async (req) => {
  const user = await apiUser();
  const body = await parseJson(req, schema);
  if (body.nativeLanguage === body.targetLanguage) {
    throw badRequest("Your target language is the same as your native language. Choose another language to learn.");
  }
  const published = await db.course.count({ where: { languageCode: body.targetLanguage, status: "PUBLISHED" } });
  if (!published) throw badRequest("This language isn't available yet. Choose one of the listed languages.");
  const goal = DAILY_GOALS.find((g) => g.minutes === body.dailyGoalMinutes)!;
  await db.$transaction([
    db.userPreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        nativeLanguage: body.nativeLanguage,
        learningObjective: body.objective,
        dailyGoalMinutes: goal.minutes,
        dailyGoalXp: goal.xp,
        focusAreas: body.focusAreas,
        timezone: safeTimeZone(body.timezone),
        activeLanguage: body.targetLanguage,
        onboardingCompletedAt: new Date(),
      },
      update: {
        nativeLanguage: body.nativeLanguage,
        learningObjective: body.objective,
        dailyGoalMinutes: goal.minutes,
        dailyGoalXp: goal.xp,
        focusAreas: body.focusAreas,
        timezone: safeTimeZone(body.timezone),
        activeLanguage: body.targetLanguage,
        onboardingCompletedAt: new Date(),
      },
    }),
    db.enrollment.upsert({
      where: { userId_languageCode: { userId: user.id, languageCode: body.targetLanguage } },
      create: { userId: user.id, languageCode: body.targetLanguage, levelCode: body.level, selfAssessed: body.level },
      update: { levelCode: body.level, selfAssessed: body.level, isActive: true, lastActiveAt: new Date() },
    }),
  ]);
  await awardAchievements(user.id).catch(() => {});
  return json({ ok: true, next: body.takePlacement ? `/onboarding/placement?lang=${body.targetLanguage}` : "/dashboard" });
});
