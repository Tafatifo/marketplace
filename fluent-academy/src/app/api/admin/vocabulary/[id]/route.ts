import { z } from "zod";
import { apiStaff } from "@/server/auth/current";
import { db } from "@/server/db";
import { json, notFound, parseJson, route } from "@/server/http";

const schema = z.object({
  translation: z.string().trim().min(1).max(300).optional(),
  ipa: z.string().trim().max(120).nullable().optional(),
  usageNote: z.string().trim().max(600).nullable().optional(),
  example: z.string().trim().min(1).max(400).optional(),
  exampleTranslation: z.string().trim().max(400).nullable().optional(),
});

/** Corrects a vocabulary entry. Editor-entered IPA is never overwritten by the automatic phonemiser. */
export const PATCH = route<RouteContext<"/api/admin/vocabulary/[id]">>(async (req, ctx) => {
  const user = await apiStaff("EDITOR", "REVIEWER");
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  const item = await db.vocabularyItem.findUnique({ where: { id } });
  if (!item) throw notFound("Vocabulary item not found.");
  const updated = await db.vocabularyItem.update({
    where: { id },
    data: { ...body, editedAt: new Date(), ...(body.ipa !== undefined ? { ipaSource: body.ipa ? "editor" : null } : {}) },
  });
  await db.auditLog.create({ data: { actorId: user.id, action: "vocabulary.update", entityType: "VocabularyItem", entityId: id, metadata: { key: item.key, fields: Object.keys(body) } } });
  return json({ item: updated });
});
