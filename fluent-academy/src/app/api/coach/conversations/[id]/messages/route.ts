import { z } from "zod";
import { apiUser } from "@/server/auth/current";
import { json, parseJson, route } from "@/server/http";
import { MAX_MESSAGE_CHARS, sendMessage, serializeMessage } from "@/server/coach/service";

const schema = z.object({ text: z.string().min(1).max(MAX_MESSAGE_CHARS) });

export const POST = route<RouteContext<"/api/coach/conversations/[id]/messages">>(async (req, ctx) => {
  const user = await apiUser();
  const { id } = await ctx.params;
  const { text } = await parseJson(req, schema);
  const out = await sendMessage(user.id, id, text);
  return json({ userMessage: serializeMessage(out.userMessage), reply: serializeMessage(out.reply), finished: out.finished });
});
