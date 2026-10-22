import { z } from "zod";
import { db } from "@/server/db";
import { apiUser } from "@/server/auth/current";
import { json, notFound, parseJson, route } from "@/server/http";

const schema = z.object({
  language: z.enum(["en", "fr", "es", "de"]),
  level: z.enum(["A1", "A2", "B1", "B2"]).optional(),
  activate: z.boolean().default(true),
});

/** Add a language, switch the active language, or change the working level. */
export const POST = route(async (req) => {
  const user = await apiUser();
  const body = await parseJson(req, schema);
  const course = await db.course.findFirst({ where: { languageCode: body.language, status: "PUBLISHED" } });
  if (!course) throw notFound("That language isn't available yet.");
  const existing = await db.enrollment.findUnique({ where: { userId_languageCode: { userId: user.id, languageCode: body.language } } });
  const enrollment = await db.enrollment.upsert({
    where: { userId_languageCode: { userId: user.id, languageCode: body.language } },
    create: { userId: user.id, languageCode: body.language, levelCode: body.level ?? "A1" },
    update: { ...(body.level ? { levelCode: body.level } : {}), isActive: true, lastActiveAt: new Date() },
  });
  if (body.activate) {
    await db.userPreferences.upsert({
      where: { userId: user.id },
      create: { userId: user.id, activeLanguage: body.language },
      update: { activeLanguage: body.language },
    });
  }
  return json({ enrollment, created: !existing });
});
