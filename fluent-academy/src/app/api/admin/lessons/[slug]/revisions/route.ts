import { z } from "zod";
import { apiStaff } from "@/server/auth/current";
import { saveDraftRevision } from "@/server/content/revisions";
import { HttpError, json, parseJson, route } from "@/server/http";

const schema = z.object({ snapshot: z.unknown(), note: z.string().max(500).optional() });

/** Saves an edited lesson as a new DRAFT revision. The live lesson is unchanged until publish. */
export const POST = route<RouteContext<"/api/admin/lessons/[slug]/revisions">>(async (req, ctx) => {
  const user = await apiStaff("EDITOR");
  const { slug } = await ctx.params;
  const body = await parseJson(req, schema, 1024 * 1024);
  const result = await saveDraftRevision(user, slug, body.snapshot, body.note);
  if (!result.ok) throw new HttpError(422, "validation_failed", "The lesson has errors. Fix them before saving.", result.issues);
  return json({ revision: { id: result.revision.id, version: result.revision.version, status: result.revision.status }, warnings: result.warnings }, { status: 201 });
});
