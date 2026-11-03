import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { clientIp, parseJson, route } from "@/server/http";
import { logIn } from "@/server/auth/service";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

const schema = z.object({
  email: z.email("Enter a valid email address.").max(200),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const POST = route(async (req) => {
  const body = await parseJson(req, schema);
  const { user, session } = await logIn(body, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  const prefs = await db.userPreferences.findUnique({ where: { userId: user.id }, select: { onboardingCompletedAt: true } });
  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    next: prefs?.onboardingCompletedAt ? "/dashboard" : "/onboarding",
  });
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  return res;
});
