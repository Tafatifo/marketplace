import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { forbidden, unauthorized } from "../http";
import { SESSION_COOKIE, hasRole, validateSessionToken, type SessionUser } from "./session";

/** The signed-in user for the current request (memoised per request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return validateSessionToken(store.get(SESSION_COOKIE)?.value);
});

/** For Server Components: redirect to login when signed out. */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return user;
}

export async function requireStaff(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (!hasRole(user, ...(roles.length ? roles : (["EDITOR", "REVIEWER"] as Role[])))) redirect("/dashboard");
  return user;
}

/** For route handlers: throw 401/403 instead of redirecting. */
export async function apiUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function apiStaff(...roles: Role[]): Promise<SessionUser> {
  const user = await apiUser();
  if (!hasRole(user, ...(roles.length ? roles : (["EDITOR", "REVIEWER"] as Role[])))) throw forbidden();
  return user;
}
