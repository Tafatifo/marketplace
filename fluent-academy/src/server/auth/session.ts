import "server-only";
import type { Role, User } from "@prisma/client";
import { db } from "../db";
import { hashIp, hashToken, randomToken } from "./tokens";

export const SESSION_COOKIE = "fa_session";
export const SESSION_TTL_DAYS = 30;
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role" | "createdAt"> & {
  sessionId: string;
};

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null } = {}) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ipHash: meta.ip ? hashIp(meta.ip) : null,
    },
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return { token, expiresAt };
}

/** Resolves a session token to its user, extending the session when it is in active use. */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, createdAt: true } } },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (now - session.lastUsedAt.getTime() > RENEW_AFTER_MS) {
    await db.session
      .update({
        where: { id: session.id },
        data: { lastUsedAt: new Date(), expiresAt: new Date(now + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000) },
      })
      .catch(() => {});
  }
  return { ...session.user, sessionId: session.id };
}

export async function revokeSessionToken(token: string | undefined | null) {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await db.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}

export function hasRole(user: { role: Role }, ...roles: Role[]) {
  return user.role === "ADMIN" || roles.includes(user.role);
}
