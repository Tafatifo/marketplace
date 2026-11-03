import { z } from "zod";
import { db } from "@/server/db";
import { apiUser } from "@/server/auth/current";
import { json, notFound, parseJson, route } from "@/server/http";

const schema = z.object({
  translation: z.string().trim().min(1).max(300).optional(),
  notes: z.string().max(1000).nullable().optional(),
  example: z.string().max(500).nullable().optional(),
  suspended: z.boolean().optional(),
  reset: z.boolean().optional(),
});

export const PATCH = route<RouteContext<"/api/vocabulary/[id]">>(async (req, ctx) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  const card = await db.userVocabulary.findFirst({ where: { id, userId: user.id } });
  if (!card) throw notFound("Word not found.");
  const word = await db.userVocabulary.update({
    where: { id },
    data: {
      ...(body.translation !== undefined ? { translation: body.translation } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.example !== undefined ? { example: body.example } : {}),
      ...(body.suspended !== undefined ? { status: body.suspended ? "SUSPENDED" : "LEARNING", dueAt: new Date() } : {}),
      ...(body.reset ? { status: "NEW", repetitions: 0, intervalDays: 0, easeFactor: 2.5, dueAt: new Date() } : {}),
    },
  });
  return json({ word });
});

export const DELETE = route<RouteContext<"/api/vocabulary/[id]">>(async (_req, ctx) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const res = await db.userVocabulary.deleteMany({ where: { id, userId: user.id } });
  if (!res.count) throw notFound("Word not found.");
  return json({ ok: true });
});
