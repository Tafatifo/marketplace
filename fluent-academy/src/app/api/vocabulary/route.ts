import { z } from "zod";
import { db } from "@/server/db";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { saveWord } from "@/server/vocabulary/service";

const schema = z.object({
  language: z.enum(["en", "fr", "es", "de"]),
  term: z.string().trim().min(1).max(200),
  translation: z.string().trim().min(1).max(300),
  example: z.string().max(500).optional(),
  definition: z.string().max(500).optional(),
  partOfSpeech: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
  sourceType: z.enum(["LESSON", "READING", "CONVERSATION", "MANUAL", "SPEAKING"]).default("MANUAL"),
  sourceId: z.string().max(80).optional(),
  sourceContext: z.string().max(500).optional(),
  vocabularyItemKey: z.string().max(80).optional(),
});

export const POST = route(async (req) => {
  const user = await apiUser();
  const body = await parseJson(req, schema);
  const word = await saveWord(user.id, body);
  return json({ word }, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await apiUser();
  const url = new URL(req.url);
  const language = url.searchParams.get("language") ?? undefined;
  const words = await db.userVocabulary.findMany({ where: { userId: user.id, ...(language ? { languageCode: language } : {}) }, orderBy: { createdAt: "desc" }, take: 500 });
  return json({ words });
});
