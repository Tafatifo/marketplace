import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { route } from "@/server/http";
import { SESSION_COOKIE, revokeSessionToken } from "@/server/auth/session";

export const POST = route(async () => {
  const store = await cookies();
  await revokeSessionToken(store.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", expires: new Date(0), sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res;
});
