import "server-only";
import type { Role } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { sendEmail } from "../email";
import { badRequest, conflict, HttpError, unauthorized } from "../http";
import { enforceRateLimit } from "../rate-limit";
import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from "./password";
import { createSession, revokeAllSessions } from "./session";
import { hashIp, hashToken, randomToken } from "./tokens";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const RESET_TTL_MS = 60 * 60 * 1000;

function roleFor(email: string): Role {
  const admins = env()
    .ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email) ? "ADMIN" : "LEARNER";
}

export async function signUp(input: { name: string; email: string; password: string }, meta: { ip: string; userAgent?: string | null }) {
  const email = normalizeEmail(input.email);
  await enforceRateLimit(`signup:${hashIp(meta.ip)}`, 10, 3600, "Too many sign-up attempts. Please try again later.");
  const problem = passwordProblem(input.password, email);
  if (problem) throw new HttpError(422, "weak_password", problem);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw conflict("An account with this email already exists. Try logging in instead.");

  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: {
      email,
      name: input.name.trim(),
      passwordHash,
      role: roleFor(email),
      preferences: { create: {} },
      subscription: { create: { planCode: "free", status: "ACTIVE", provider: "none" } },
    },
  });
  const session = await createSession(user.id, { ip: meta.ip, userAgent: meta.userAgent });
  return { user, session };
}

export async function logIn(input: { email: string; password: string }, meta: { ip: string; userAgent?: string | null }) {
  const email = normalizeEmail(input.email);
  await enforceRateLimit(`login-ip:${hashIp(meta.ip)}`, 30, 900, "Too many login attempts. Please wait 15 minutes.");
  await enforceRateLimit(`login-email:${hashToken(email)}`, 10, 900, "Too many login attempts for this account. Please wait 15 minutes or reset your password.");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await burnPasswordCheck(input.password);
    throw unauthorized("Incorrect email or password.");
  }
  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) throw unauthorized("Incorrect email or password.");
  const session = await createSession(user.id, { ip: meta.ip, userAgent: meta.userAgent });
  return { user, session };
}

/** Always resolves the same way, whether or not the email exists, to avoid account enumeration. */
export async function requestPasswordReset(emailInput: string, meta: { ip: string }) {
  const email = normalizeEmail(emailInput);
  await enforceRateLimit(`forgot-ip:${hashIp(meta.ip)}`, 10, 3600, "Too many requests. Please try again later.");
  await enforceRateLimit(`forgot-email:${hashToken(email)}`, 3, 3600, "A reset link was sent recently. Please check your inbox.");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { sent: true };

  const token = randomToken();
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  const link = `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const result = await sendEmail({
    to: user.email,
    subject: "Reset your Fluent Academy password",
    text: `Hello ${user.name},\n\nUse this link to choose a new password. It expires in one hour and can be used once:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email — your password won't change.\n\nFluent Academy`,
    html: `<p>Hello ${escapeHtml(user.name)},</p><p>Use this link to choose a new password. It expires in one hour and can be used once:</p><p><a href="${link}">Reset my password</a></p><p>If you didn't ask for this, you can ignore this email — your password won't change.</p><p>Fluent Academy</p>`,
  });
  if (!result.delivered) throw new HttpError(503, "email_unavailable", "Password recovery email is not configured on this server. Please contact support.");
  return { sent: true };
}

export async function resetPassword(input: { token: string; password: string }, meta: { ip: string; userAgent?: string | null }) {
  await enforceRateLimit(`reset-ip:${hashIp(meta.ip)}`, 20, 3600);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw badRequest("This reset link is invalid or has expired. Request a new one.");
  }
  const problem = passwordProblem(input.password, record.user.email);
  if (problem) throw new HttpError(422, "weak_password", problem);
  const passwordHash = await hashPassword(input.password);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } }),
  ]);
  await revokeAllSessions(record.userId);
  const session = await createSession(record.userId, { ip: meta.ip, userAgent: meta.userAgent });
  return { userId: record.userId, session };
}

export async function changePassword(userId: string, sessionId: string, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, current))) throw new HttpError(422, "wrong_password", "Your current password is incorrect.");
  const problem = passwordProblem(next, user.email);
  if (problem) throw new HttpError(422, "weak_password", problem);
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await revokeAllSessions(userId, sessionId);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
