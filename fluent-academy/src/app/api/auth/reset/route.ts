import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, parseJson, route } from "@/server/http";
import { resetPassword } from "@/server/auth/service";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

const schema = z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) });

export const POST = route(async (req) => {
  const body = await parseJson(req, schema);
  const { session } = await resetPassword(body, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  const res = NextResponse.json({ ok: true, next: "/dashboard" });
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  return res;
});
