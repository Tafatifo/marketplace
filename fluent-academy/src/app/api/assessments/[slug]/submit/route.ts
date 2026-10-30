import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { submitLevelAssessment } from "@/server/assessment/level";
import { writtenResponseSchema } from "@/server/exercises/schemas";
import type { LearnerResponse } from "@/lib/validate";

const schema = z.object({ answers: z.record(z.string().max(40), writtenResponseSchema) });

export const POST = route<RouteContext<"/api/assessments/[slug]/submit">>(async (req, ctx) => {
  const user = await apiUser();
  const { slug } = await ctx.params;
  const { answers } = await parseJson(req, schema, 256 * 1024);
  return json(await submitLevelAssessment(user.id, slug, answers as Record<string, LearnerResponse>));
});
