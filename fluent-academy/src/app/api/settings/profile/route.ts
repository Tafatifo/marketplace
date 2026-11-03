import { z } from "zod";
import { db } from "@/server/db";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";

const schema = z.object({ name: z.string().trim().min(1).max(80) });

export const PATCH = route(async (req) => {
  const user = await apiUser();
  const { name } = await parseJson(req, schema);
  await db.user.update({ where: { id: user.id }, data: { name } });
  return json({ ok: true });
});
