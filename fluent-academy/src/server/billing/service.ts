import "server-only";
import Stripe from "stripe";
import { Prisma, type SubscriptionStatus } from "@prisma/client";
import { db } from "../db";
import { env, resolvedBillingMode } from "../env";
import { badRequest, forbidden, HttpError } from "../http";
import { logger } from "../logger";
import { getPlan } from "./plans";

const log = logger("billing");

let stripeClient: Stripe | null = null;
export function stripe(): Stripe {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, "billing_unavailable", "Payments are not configured on this server.");
  return (stripeClient ??= new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "Fluent Academy" } }));
}

function mapStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "incomplete":
      return "INCOMPLETE";
    default:
      return "CANCELED";
  }
}

export async function createCheckout(user: { id: string; email: string }, planCode: string, interval: "month" | "year") {
  if (resolvedBillingMode() !== "stripe") throw badRequest("Online payments are not enabled on this server.");
  const plan = await getPlan(planCode);
  const price = interval === "year" ? plan.stripePriceYearly : plan.stripePriceMonthly;
  if (!price) throw new HttpError(503, "billing_unavailable", "This plan has no Stripe price configured yet.");
  const sub = await db.subscription.findUnique({ where: { userId: user.id } });
  let customer = sub?.providerCustomerId ?? undefined;
  if (!customer) {
    const c = await stripe().customers.create({ email: user.email, metadata: { userId: user.id } });
    customer = c.id;
    await db.subscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, providerCustomerId: customer, provider: "stripe" },
      update: { providerCustomerId: customer },
    });
  }
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId: user.id, planCode } },
    metadata: { userId: user.id, planCode },
    success_url: `${env().APP_URL}/billing?checkout=success`,
    cancel_url: `${env().APP_URL}/billing?checkout=cancelled`,
  });
  return session.url;
}

export async function createPortal(userId: string) {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub?.providerCustomerId || sub.provider !== "stripe") throw badRequest("No billing account found.");
  const portal = await stripe().billingPortal.sessions.create({ customer: sub.providerCustomerId, return_url: `${env().APP_URL}/billing` });
  return portal.url;
}

async function syncSubscription(s: Stripe.Subscription) {
  const customerId = typeof s.customer === "string" ? s.customer : s.customer.id;
  const userId = (s.metadata?.userId as string | undefined) ?? (await db.subscription.findUnique({ where: { providerCustomerId: customerId } }))?.userId;
  if (!userId) {
    log.warn("Subscription event for unknown customer", { customerId, subscription: s.id });
    return;
  }
  const item = s.items.data[0];
  const status = mapStatus(s.status);
  // Metadata is written by our own checkout, but only a known paid plan is ever granted.
  const requested = (s.metadata?.planCode as string | undefined) ?? "premium";
  const known = requested !== "free" && (await getPlan(requested)).code === requested;
  const planCode = status === "CANCELED" ? "free" : known ? requested : "premium";
  await db.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planCode,
      status,
      provider: "stripe",
      providerCustomerId: customerId,
      providerSubscriptionId: s.id,
      interval: item?.price.recurring?.interval ?? null,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: s.cancel_at_period_end,
    },
    update: {
      planCode,
      status,
      provider: "stripe",
      providerCustomerId: customerId,
      providerSubscriptionId: s.id,
      interval: item?.price.recurring?.interval ?? null,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: s.cancel_at_period_end,
    },
  });
}

/**
 * Stripe webhook handler. Entitlements are granted only here, from signature-verified
 * events — never because the browser reports a successful payment. Events are
 * processed idempotently (PaymentEvent.eventId is unique).
 */
export async function handleStripeWebhook(rawBody: string, signature: string | null) {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, "billing_unavailable", "Webhook secret not configured.");
  if (!signature) throw badRequest("Missing signature.");
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw badRequest("Invalid webhook signature.");
  }
  try {
    await db.paymentEvent.create({ data: { provider: "stripe", eventId: event.id, type: event.type, payload: event as unknown as Prisma.InputJsonValue, outcome: "received" } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { duplicate: true };
    throw err;
  }
  let outcome = "ignored";
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const sub = await stripe().subscriptions.retrieve(subId);
        if (!sub.metadata?.userId && session.client_reference_id) sub.metadata = { ...sub.metadata, userId: session.client_reference_id };
        await syncSubscription(sub);
        outcome = "subscription-synced";
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription);
      outcome = "subscription-synced";
      break;
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customerId) await db.subscription.updateMany({ where: { providerCustomerId: customerId }, data: { status: "PAST_DUE" } });
      outcome = "marked-past-due";
      break;
    }
  }
  await db.paymentEvent.update({ where: { eventId: event.id }, data: { outcome } });
  return { duplicate: false, type: event.type, outcome };
}

/** Development-only subscription simulator. Refuses to run unless BILLING_MODE resolves to "simulation". */
export async function simulateSubscription(userId: string, action: "subscribe" | "cancel" | "resume" | "expire", interval: "month" | "year" = "month") {
  if (resolvedBillingMode() !== "simulation") throw forbidden("The subscription simulator is disabled on this server.");
  const now = Date.now();
  const end = new Date(now + (interval === "year" ? 365 : 30) * 86_400_000);
  const data =
    action === "subscribe"
      ? { planCode: "premium", status: "ACTIVE" as const, provider: "simulation", interval, currentPeriodEnd: end, cancelAtPeriodEnd: false }
      : action === "cancel"
        ? { cancelAtPeriodEnd: true }
        : action === "resume"
          ? { cancelAtPeriodEnd: false }
          : { planCode: "free", status: "CANCELED" as const, currentPeriodEnd: new Date(now - 1000), cancelAtPeriodEnd: false };
  await db.subscription.upsert({ where: { userId }, create: { userId, provider: "simulation", ...data }, update: data });
  await db.auditLog.create({ data: { actorId: userId, action: `billing.simulate.${action}`, entityType: "Subscription", entityId: userId, metadata: { interval } } });
}
