import { z } from "zod";
import { clientIp, json, parseJson, route } from "@/server/http";
import { requestPasswordReset } from "@/server/auth/service";

const schema = z.object({ email: z.email("Enter a valid email address.").max(200) });

export const POST = route(async (req) => {
  const { email } = await parseJson(req, schema);
  await requestPasswordReset(email, { ip: clientIp(req) });
  return json({ ok: true, message: "If an account exists for that email, we've sent a reset link." });
});
