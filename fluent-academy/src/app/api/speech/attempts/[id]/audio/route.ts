import { db } from "@/server/db";
import { apiUser } from "@/server/auth/current";
import { notFound, route } from "@/server/http";
import { recordingStore } from "@/server/storage";

/** Streams a learner's own recording. Other users' recordings are never accessible. */
export const GET = route<RouteContext<"/api/speech/attempts/[id]/audio">>(async (_req, ctx) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const attempt = await db.speakingAttempt.findFirst({ where: { id, userId: user.id }, select: { audioKey: true, audioMimeType: true } });
  if (!attempt?.audioKey) throw notFound("This recording is no longer stored.");
  const data = await recordingStore().get(attempt.audioKey);
  if (!data) throw notFound("This recording is no longer stored.");
  return new Response(new Uint8Array(data), {
    headers: { "content-type": attempt.audioMimeType ?? "audio/webm", "cache-control": "private, no-store", "content-length": String(data.length) },
  });
});
