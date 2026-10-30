import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { createCheckout } from "@/server/billing/service";

const schema = z.object({ plan: z.literal("premium").default("premium"), interval: z.enum(["month", "year"]).default("month") });

export const POST = route(async (req) => {
  const user = await apiUser();
  const body = await parseJson(req, schema);
  return json({ url: await createCheckout(user, body.plan, body.interval) });
});
