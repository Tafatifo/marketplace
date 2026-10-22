import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { startConversation } from "@/server/coach/service";

const schema = z.object({
  scenarioSlug: z.string().min(1).max(80),
  correctionMode: z.enum(["GENTLE", "BALANCED", "INTENSIVE"]).optional(),
  passageSlug: z.string().max(120).optional(),
});

export const POST = route(async (req) => {
  const user = await apiUser();
  const body = await parseJson(req, schema);
  const conv = await startConversation(user.id, body);
  return json({ id: conv.id }, { status: 201 });
});
