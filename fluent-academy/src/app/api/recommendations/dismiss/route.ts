import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { dismissRecommendation } from "@/server/recommendations";

const schema = z.object({ key: z.string().min(1).max(200), days: z.number().int().min(1).max(90).default(7) });

export const POST = route(async (req) => {
  const user = await apiUser();
  const { key, days } = await parseJson(req, schema);
  await dismissRecommendation(user.id, key, days);
  return json({ ok: true });
});
