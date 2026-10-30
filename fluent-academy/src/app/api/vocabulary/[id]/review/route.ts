import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { reviewCard } from "@/server/vocabulary/service";

const schema = z.object({
  mode: z.enum(["PRODUCTION", "RECALL", "LISTENING", "CONTEXT"]),
  response: z.string().max(300),
  selfGrade: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
});

export const POST = route<RouteContext<"/api/vocabulary/[id]/review">>(async (req, ctx) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  return json(await reviewCard(user.id, id, body));
});
