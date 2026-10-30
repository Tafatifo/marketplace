import { apiUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { badRequest, json, route } from "@/server/http";
import { dueCards } from "@/server/vocabulary/service";

export const GET = route(async () => {
  const user = await apiUser();
  const prefs = await db.userPreferences.findUnique({ where: { userId: user.id }, select: { activeLanguage: true } });
  if (!prefs?.activeLanguage) throw badRequest("No active language.");
  return json({ cards: await dueCards(user.id, prefs.activeLanguage, 30) });
});
