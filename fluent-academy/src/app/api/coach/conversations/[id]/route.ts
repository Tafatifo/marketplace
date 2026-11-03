import { db } from "@/server/db";
import { apiUser } from "@/server/auth/current";
import { json, notFound, route } from "@/server/http";

export const DELETE = route<RouteContext<"/api/coach/conversations/[id]">>(async (_req, ctx) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const res = await db.conversation.deleteMany({ where: { id, userId: user.id } });
  if (!res.count) throw notFound("Conversation not found.");
  return json({ ok: true });
});
