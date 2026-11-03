import { z } from "zod";
import { apiStaff } from "@/server/auth/current";
import { db } from "@/server/db";
import { json, notFound, parseJson, route } from "@/server/http";

const schema = z.object({
  verdict: z.enum(["APPROVED", "REJECTED"]).nullable(),
  note: z.string().trim().max(500).optional(),
});

/** A person's verdict on a generated clip after listening to it. */
export const PATCH = route<RouteContext<"/api/admin/audio/[id]">>(async (req, ctx) => {
  const user = await apiStaff("REVIEWER");
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  const asset = await db.audioAsset.findUnique({ where: { id }, select: { id: true, key: true } });
  if (!asset) throw notFound("Audio clip not found.");
  const updated = await db.audioAsset.update({
    where: { id },
    data: { humanVerdict: body.verdict, humanNote: body.note || null, reviewedAt: body.verdict ? new Date() : null },
    select: { id: true, humanVerdict: true, humanNote: true, reviewedAt: true },
  });
  await db.auditLog.create({ data: { actorId: user.id, action: "audio.verdict", entityType: "AudioAsset", entityId: id, metadata: { key: asset.key, verdict: body.verdict } } });
  return json({ asset: updated });
});
