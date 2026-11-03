import { apiUser } from "@/server/auth/current";
import { json, route } from "@/server/http";
import { endConversation } from "@/server/coach/service";

export const POST = route<RouteContext<"/api/coach/conversations/[id]/end">>(async (_req, ctx) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const conv = await endConversation(user.id, id);
  return json({ id: conv.id, review: conv.review });
});
