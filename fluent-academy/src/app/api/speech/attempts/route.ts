import { z } from "zod";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { apiUser } from "@/server/auth/current";
import { badRequest, HttpError, json, route, validate } from "@/server/http";
import { createSpeakingAttempt, serializeAttempt } from "@/server/speech/service";
import { COURSE_LANGUAGES } from "@/content/types";

const fields = z.object({
  language: z.enum(COURSE_LANGUAGES),
  context: z.enum(["SENTENCE", "EXERCISE", "FREE", "CONVERSATION"]),
  targetText: z.string().max(500).optional(),
  sourceId: z.string().max(60).optional(),
  browserTranscript: z.string().max(1000).optional(),
  durationMs: z.coerce.number().int().min(0).max(120000).optional(),
  mockTranscript: z.string().max(1000).optional(),
});

export const POST = route(async (req) => {
  const user = await apiUser();
  const length = Number(req.headers.get("content-length") || 0);
  if (length > env().MAX_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, "payload_too_large", "Recording is too large.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Expected a multipart upload.");
  }
  const file = form.get("audio");
  if (!(file instanceof Blob)) throw badRequest("Missing audio file.");
  const meta = validate(fields, Object.fromEntries([...form.entries()].filter(([k]) => k !== "audio").map(([k, v]) => [k, typeof v === "string" && v !== "" ? v : undefined])));
  const audio = Buffer.from(await file.arrayBuffer());
  const attempt = await createSpeakingAttempt(user.id, { ...meta, audio, mockTranscript: env().NODE_ENV !== "production" ? meta.mockTranscript : undefined });
  return json({ attempt }, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await apiUser();
  const url = new URL(req.url);
  const language = url.searchParams.get("language") ?? undefined;
  const take = Math.min(50, Number(url.searchParams.get("take") ?? 20));
  const attempts = await db.speakingAttempt.findMany({ where: { userId: user.id, ...(language ? { languageCode: language } : {}) }, orderBy: { createdAt: "desc" }, take });
  return json({ attempts: attempts.map(serializeAttempt) });
});
