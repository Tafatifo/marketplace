import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { HttpError, json, parseJson, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { logger } from "@/server/logger";
import { synthesize } from "@/server/speech/tts";
import { COURSE_LANGUAGES } from "@/content/types";

const schema = z.object({ text: z.string().min(1).max(1200), language: z.enum(COURSE_LANGUAGES), gender: z.enum(["f", "m"]).default("f") });

export const POST = route(async (req) => {
  const user = await apiUser();
  await enforceRateLimit(`tts:${user.id}`, 60, 600, "Too many audio requests. Please wait a moment.");
  const body = await parseJson(req, schema);
  try {
    const r = await synthesize(body.text, body.language, body.gender);
    if (!r) return json({ url: null, reason: "Server speech synthesis isn't configured." });
    return json({ url: `/api/speech/tts/${r.hash}` });
  } catch (err) {
    logger("tts").error("Synthesis failed", { error: err });
    throw new HttpError(502, "tts_unavailable", "Audio couldn't be generated right now.");
  }
});
