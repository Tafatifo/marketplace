import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, parseJson, route } from "@/server/http";
import { signUp } from "@/server/auth/service";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email: z.email("Enter a valid email address.").max(200),
  password: z.string().min(1).max(200),
});

export const POST = route(async (req) => {
  const body = await parseJson(req, schema);
  const { user, session } = await signUp(body, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email }, next: "/onboarding" }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  return res;
});
