import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { submitAttempt } from "@/server/lessons/service";
import { responseSchema } from "@/server/exercises/schemas";

const schema = z.object({
  response: responseSchema,
  sessionKey: z.string().uuid().optional(),
  mode: z.enum(["lesson", "review"]).default("lesson"),
});

export const POST = route<RouteContext<"/api/exercises/[id]/attempt">>(async (req, ctx) => {
  const user = await apiUser();
  await enforceRateLimit(`attempt:${user.id}`, 240, 600, "You're answering very quickly — please slow down a little.");
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  const out = await submitAttempt(user.id, id, body.response, { sessionKey: body.sessionKey, mode: body.mode });
  return json(out);
});
