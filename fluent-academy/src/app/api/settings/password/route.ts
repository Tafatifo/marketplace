import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { changePassword } from "@/server/auth/service";

const schema = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) });

export const POST = route(async (req) => {
  const user = await apiUser();
  await enforceRateLimit(`pwchange:${user.id}`, 10, 3600);
  const body = await parseJson(req, schema);
  await changePassword(user.id, user.sessionId, body.current, body.next);
  return json({ ok: true, message: "Password changed. Other devices have been signed out." });
});
