import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { apiUser } from "@/server/auth/current";
import { HttpError, parseJson, route } from "@/server/http";
import { verifyPassword } from "@/server/auth/password";
import { SESSION_COOKIE } from "@/server/auth/session";
import { deleteAttemptAudio } from "@/server/speech/service";
import { logger } from "@/server/logger";
import { stripe } from "@/server/billing/service";

const schema = z.object({ password: z.string().min(1).max(200), confirm: z.literal("DELETE") });

/** Permanently deletes the account and every private record (cascading deletes). */
export const POST = route(async (req) => {
  const user = await apiUser();
  const { password } = await parseJson(req, schema);
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(row.passwordHash, password))) throw new HttpError(422, "wrong_password", "Your password is incorrect.");
  const sub = await db.subscription.findUnique({ where: { userId: user.id } });
  if (sub?.provider === "stripe" && sub.providerSubscriptionId && sub.status !== "CANCELED") {
    try {
      await stripe().subscriptions.cancel(sub.providerSubscriptionId);
    } catch (err) {
      logger("account").error("Could not cancel Stripe subscription during account deletion", { error: err, userId: user.id });
      throw new HttpError(502, "billing_error", "We couldn't cancel your subscription automatically. Cancel it from Plan & billing first, then try again.");
    }
  }
  await deleteAttemptAudio(user.id);
  await db.auditLog.create({ data: { actorId: null, action: "account.deleted", entityType: "User", entityId: user.id } });
  await db.user.delete({ where: { id: user.id } });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
});
