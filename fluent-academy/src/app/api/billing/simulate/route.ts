import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { simulateSubscription } from "@/server/billing/service";

const schema = z.object({ action: z.enum(["subscribe", "cancel", "resume", "expire"]), interval: z.enum(["month", "year"]).default("month") });

export const POST = route(async (req) => {
  const user = await apiUser();
  const body = await parseJson(req, schema);
  await simulateSubscription(user.id, body.action, body.interval);
  return json({ ok: true, simulated: true });
});
