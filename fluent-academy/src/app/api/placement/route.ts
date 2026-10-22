import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { savePlacement, scorePlacement } from "@/server/assessment/placement";
import { writtenResponseSchema } from "@/server/exercises/schemas";
import { awardAchievements } from "@/server/progress/achievements";

const schema = z.object({
  language: z.enum(["en", "fr", "es", "de"]),
  answers: z.record(z.string().max(80), writtenResponseSchema),
  finish: z.boolean().default(false),
});

/** Scores the placement blocks answered so far; with finish=true the result is saved. */
export const POST = route(async (req) => {
  const user = await apiUser();
  const body = await parseJson(req, schema);
  if (body.finish) {
    const result = await savePlacement(user.id, body.language, body.answers);
    await awardAchievements(user.id).catch(() => {});
    return json({ ...result, detail: undefined, saved: true });
  }
  const result = await scorePlacement(body.language, body.answers);
  return json({ ...result, detail: undefined, saved: false });
});
