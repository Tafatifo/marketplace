import { apiStaff } from "@/server/auth/current";
import { currentSnapshot } from "@/server/content/revisions";
import { notFound, route } from "@/server/http";

/** Downloads the live lesson as JSON (to archive CMS edits or port them back to /content). */
export const GET = route<RouteContext<"/api/admin/lessons/[slug]/export">>(async (_req, ctx) => {
  await apiStaff();
  const { slug } = await ctx.params;
  const current = await currentSnapshot(slug);
  if (!current) throw notFound("Lesson not found.");
  return new Response(JSON.stringify({ slug, version: current.version, ...current.snapshot }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-v${current.version}.json"`,
    },
  });
});
