import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { completeLesson } from "@/server/lessons/service";

const schema = z.object({ sessionKey: z.string().uuid() });

export const POST = route<RouteContext<"/api/lessons/[slug]/complete">>(async (req, ctx) => {
  const user = await apiUser();
  const { slug } = await ctx.params;
  const { sessionKey } = await parseJson(req, schema);
  const result = await completeLesson(user.id, slug, sessionKey);
  return json(result);
});
