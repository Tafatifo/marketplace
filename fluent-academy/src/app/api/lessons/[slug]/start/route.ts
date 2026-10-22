import { apiUser } from "@/server/auth/current";
import { json, route } from "@/server/http";
import { startLesson } from "@/server/lessons/service";

export const POST = route<RouteContext<"/api/lessons/[slug]/start">>(async (_req, ctx) => {
  const user = await apiUser();
  const { slug } = await ctx.params;
  const { sessionKey, progress } = await startLesson(user.id, slug);
  return json({ sessionKey, status: progress.status });
});
