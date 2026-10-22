import { db } from "@/server/db";
import { apiUser } from "@/server/auth/current";
import { json, route } from "@/server/http";

export const POST = route(async () => {
  const user = await apiUser();
  const r = await db.conversation.deleteMany({ where: { userId: user.id } });
  await db.learningObservation.deleteMany({ where: { userId: user.id, source: "CONVERSATION" } });
  return json({ deleted: r.count });
});
