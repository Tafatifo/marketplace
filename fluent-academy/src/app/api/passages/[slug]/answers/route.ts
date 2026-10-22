import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { submitPassageAnswers } from "@/server/passages";
import { writtenResponseSchema } from "@/server/exercises/schemas";
import type { LearnerResponse } from "@/lib/validate";

const schema = z.object({ answers: z.record(z.string().max(120), writtenResponseSchema) });

export const POST = route<RouteContext<"/api/passages/[slug]/answers">>(async (req, ctx) => {
  const user = await apiUser();
  const { slug } = await ctx.params;
  const { answers } = await parseJson(req, schema);
  return json(await submitPassageAnswers(user.id, slug, answers as Record<string, LearnerResponse>));
});
