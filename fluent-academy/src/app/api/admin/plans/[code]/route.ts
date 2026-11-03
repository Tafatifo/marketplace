import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiStaff } from "@/server/auth/current";
import { db } from "@/server/db";
import { json, notFound, parseJson, route } from "@/server/http";

const limit = z.number().int().min(0).max(100_000).nullable();
const schema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(300),
  priceMonthlyCents: z.number().int().min(0).max(100_000),
  priceYearlyCents: z.number().int().min(0).max(1_000_000),
  currency: z.string().trim().toLowerCase().length(3),
  stripePriceMonthly: z.string().trim().max(100).nullable(),
  stripePriceYearly: z.string().trim().max(100).nullable(),
  features: z.array(z.string().trim().min(1).max(160)).max(20),
  limits: z.object({
    lessonsPerDay: limit,
    conversationsPerDay: limit,
    messagesPerConversation: limit,
    speakingAttemptsPerDay: limit,
    vocabularyReviewsPerDay: limit,
    freeUnitsOnly: z.boolean(),
    premiumReadings: z.boolean(),
    detailedAnalytics: z.boolean(),
    personalizedPractice: z.boolean(),
  }).strict(),
});

/** Plan pricing and limits (admins only). Prices here are what the site displays; Stripe charges the configured Price IDs. */
export const PATCH = route<RouteContext<"/api/admin/plans/[code]">>(async (req, ctx) => {
  const user = await apiStaff("ADMIN");
  const { code } = await ctx.params;
  const body = await parseJson(req, schema);
  const plan = await db.plan.findUnique({ where: { code } });
  if (!plan) throw notFound("Plan not found.");
  const updated = await db.plan.update({
    where: { code },
    data: { ...body, stripePriceMonthly: body.stripePriceMonthly || null, stripePriceYearly: body.stripePriceYearly || null, limits: body.limits as Prisma.InputJsonValue },
  });
  await db.auditLog.create({
    data: { actorId: user.id, action: "plan.update", entityType: "Plan", entityId: code, metadata: { before: { price: [plan.priceMonthlyCents, plan.priceYearlyCents], limits: plan.limits }, after: { price: [body.priceMonthlyCents, body.priceYearlyCents], limits: body.limits } } as Prisma.InputJsonValue },
  });
  return json({ plan: updated });
});
