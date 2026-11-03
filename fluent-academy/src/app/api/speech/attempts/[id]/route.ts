import { db } from "@/server/db";
import { apiUser } from "@/server/auth/current";
import { json, notFound, route } from "@/server/http";
import { deleteAttemptAudio } from "@/server/speech/service";

export const DELETE = route<RouteContext<"/api/speech/attempts/[id]">>(async (_req, ctx) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const attempt = await db.speakingAttempt.findFirst({ where: { id, userId: user.id } });
  if (!attempt) throw notFound("Recording not found.");
  await deleteAttemptAudio(user.id, id);
  await db.speakingAttempt.delete({ where: { id } });
  return json({ ok: true });
});
