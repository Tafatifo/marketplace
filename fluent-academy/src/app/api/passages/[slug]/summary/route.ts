import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { submitSummary } from "@/server/passages";

const schema = z.object({ text: z.string().trim().min(1).max(4000) });

export const POST = route<RouteContext<"/api/passages/[slug]/summary">>(async (req, ctx) => {
  const user = await apiUser();
  await enforceRateLimit(`summary:${user.id}`, 10, 3600, "You've submitted several summaries recently. Please wait a little.");
  const { slug } = await ctx.params;
  const { text } = await parseJson(req, schema);
  return json({ feedback: await submitSummary(user.id, slug, text) });
});
