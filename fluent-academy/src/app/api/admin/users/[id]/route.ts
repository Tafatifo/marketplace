import { z } from "zod";
import { apiStaff } from "@/server/auth/current";
import { revokeAllSessions } from "@/server/auth/session";
import { db } from "@/server/db";
import { badRequest, json, notFound, parseJson, route } from "@/server/http";

const schema = z.object({ role: z.enum(["LEARNER", "EDITOR", "REVIEWER", "ADMIN"]) });

/** Role changes (admins only). Changing a role signs the user out everywhere. */
export const PATCH = route<RouteContext<"/api/admin/users/[id]">>(async (req, ctx) => {
  const actor = await apiStaff("ADMIN");
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  if (id === actor.id) throw badRequest("You can't change your own role.");
  const target = await db.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) throw notFound("User not found.");
  if (target.role === body.role) return json({ user: { id, role: body.role } });
  if (target.role === "ADMIN" && body.role !== "ADMIN") {
    const admins = await db.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) throw badRequest("There must be at least one admin.");
  }
  await db.user.update({ where: { id }, data: { role: body.role } });
  await revokeAllSessions(id);
  await db.auditLog.create({ data: { actorId: actor.id, action: "user.role", entityType: "User", entityId: id, metadata: { from: target.role, to: body.role } } });
  return json({ user: { id, role: body.role } });
});
