import { z } from "zod";
import { apiStaff } from "@/server/auth/current";
import { transitionRevision } from "@/server/content/revisions";
import { json, parseJson, route } from "@/server/http";

const schema = z.object({
  action: z.enum(["submit", "approve", "reject", "publish"]),
  comment: z.string().trim().max(500).optional(),
});

export const PATCH = route<RouteContext<"/api/admin/revisions/[id]">>(async (req, ctx) => {
  const user = await apiStaff();
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  const revision = await transitionRevision(user, id, body.action, body.comment || undefined);
  return json({ revision: revision && { id: revision.id, status: revision.status, version: revision.version } });
});
