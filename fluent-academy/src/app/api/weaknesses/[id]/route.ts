import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, notFound, parseJson, route } from "@/server/http";
import { setWeaknessDismissed } from "@/server/learner-model/observations";

const schema = z.object({ dismissed: z.boolean() });

/** Learners can dismiss (or restore) a focus area they believe is wrong. */
export const PATCH = route<RouteContext<"/api/weaknesses/[id]">>(async (req, ctx) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const { dismissed } = await parseJson(req, schema);
  const w = await setWeaknessDismissed(user.id, id, dismissed);
  if (!w) throw notFound("Focus area not found.");
  return json({ weakness: w });
});
