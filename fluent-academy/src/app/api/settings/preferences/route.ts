import { z } from "zod";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { DAILY_GOALS, FOCUS_AREAS, NATIVE_LANGUAGES } from "@/lib/languages";
import { safeTimeZone } from "@/lib/dates";
import { deleteAttemptAudio } from "@/server/speech/service";

const schema = z.object({
  nativeLanguage: z.enum(NATIVE_LANGUAGES.map(([c]) => c) as [string, ...string[]]).optional(),
  explainInNative: z.boolean().optional(),
  correctionMode: z.enum(["GENTLE", "BALANCED", "INTENSIVE"]).optional(),
  dailyGoalMinutes: z.number().int().refine((m) => DAILY_GOALS.some((g) => g.minutes === m)).optional(),
  focusAreas: z.array(z.enum(FOCUS_AREAS.map(([c]) => c) as [string, ...string[]])).max(7).optional(),
  timezone: z.string().max(64).optional(),
  retainRecordings: z.boolean().optional(),
  recordingRetentionDays: z.number().int().min(1).max(365).optional(),
  playbackRate: z.number().min(0.5).max(1.5).optional(),
  marketingEmails: z.boolean().optional(),
});

export const PATCH = route(async (req) => {
  const user = await apiUser();
  const body = await parseJson(req, schema);
  const goal = body.dailyGoalMinutes ? DAILY_GOALS.find((g) => g.minutes === body.dailyGoalMinutes) : undefined;
  const maxDays = env().RECORDING_RETENTION_DAYS || 365;
  const data = {
    ...body,
    ...(goal ? { dailyGoalXp: goal.xp } : {}),
    ...(body.timezone ? { timezone: safeTimeZone(body.timezone) } : {}),
    ...(body.recordingRetentionDays ? { recordingRetentionDays: Math.min(body.recordingRetentionDays, maxDays) } : {}),
  };
  const prefs = await db.userPreferences.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  // Turning storage off deletes existing recordings; shortening retention re-dates them.
  if (body.retainRecordings === false) await deleteAttemptAudio(user.id);
  if (body.recordingRetentionDays) {
    const attempts = await db.speakingAttempt.findMany({ where: { userId: user.id, audioKey: { not: null } }, select: { id: true, createdAt: true } });
    for (const a of attempts) {
      await db.speakingAttempt.update({ where: { id: a.id }, data: { audioExpiresAt: new Date(a.createdAt.getTime() + prefs.recordingRetentionDays * 86_400_000) } });
    }
  }
  return json({ preferences: prefs });
});
