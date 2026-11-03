import { apiUser } from "@/server/auth/current";
import { notFound, route } from "@/server/http";
import { ttsStore } from "@/server/storage";

export const GET = route<RouteContext<"/api/speech/tts/[hash]">>(async (_req, ctx) => {
  await apiUser();
  const { hash } = await ctx.params;
  if (!/^[a-f0-9]{24}$/.test(hash)) throw notFound();
  const data = await ttsStore().get(`${hash}.mp3`);
  if (!data) throw notFound();
  return new Response(new Uint8Array(data), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
});
