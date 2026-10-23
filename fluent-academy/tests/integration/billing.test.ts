import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { entitlementFor } from "@/server/learner";
import { handleStripeWebhook, simulateSubscription } from "@/server/billing/service";
import { createLearner } from "../helpers";

const SECRET = "whsec_test_secret_for_signature_checks";

function signed(event: object) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { payload, header };
}

function subscriptionEvent(id: string, type: string, userId: string, status: string, planCode = "premium") {
  return {
    id,
    object: "event",
    type,
    data: {
      object: {
        id: `sub_${userId}`,
        object: "subscription",
        customer: `cus_${userId}`,
        status,
        cancel_at_period_end: false,
        metadata: { userId, planCode },
        items: { data: [{ price: { recurring: { interval: "month" } }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
      },
    },
  };
}

describe("subscriptions and entitlements", () => {
  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder_not_used_for_network";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.BILLING_MODE = "stripe";
    resetEnvCache();
  });
  afterAll(() => {
    process.env.STRIPE_SECRET_KEY = "";
    process.env.STRIPE_WEBHOOK_SECRET = "";
    process.env.BILLING_MODE = "simulation";
    resetEnvCache();
  });

  it("starts every account on the free plan", async () => {
    const { user } = await createLearner();
    expect((await entitlementFor(user.id)).isPremium).toBe(false);
  });

  it("rejects unsigned or forged webhooks without changing entitlements", async () => {
    const { user } = await createLearner();
    const { payload } = signed(subscriptionEvent("evt_forged", "customer.subscription.updated", user.id, "active"));
    await expect(handleStripeWebhook(payload, null)).rejects.toMatchObject({ status: 400 });
    await expect(handleStripeWebhook(payload, "t=1,v1=deadbeef")).rejects.toMatchObject({ status: 400 });
    const tampered = signed(subscriptionEvent("evt_tampered", "customer.subscription.updated", user.id, "active"));
    await expect(handleStripeWebhook(tampered.payload.replace("active", "trialing"), tampered.header)).rejects.toMatchObject({ status: 400 });
    expect((await entitlementFor(user.id)).isPremium).toBe(false);
  });

  it("grants Premium only from a verified event, processes each event once, and revokes on cancellation", async () => {
    const { user } = await createLearner();
    const evtId = `evt_${user.id}_1`;
    const up = signed(subscriptionEvent(evtId, "customer.subscription.updated", user.id, "active"));
    expect(await handleStripeWebhook(up.payload, up.header)).toMatchObject({ duplicate: false, outcome: "subscription-synced" });
    expect((await entitlementFor(user.id)).isPremium).toBe(true);
    expect(await handleStripeWebhook(up.payload, up.header)).toEqual({ duplicate: true });
    expect(await db.paymentEvent.count({ where: { eventId: evtId } })).toBe(1);

    const del = signed(subscriptionEvent(`evt_${user.id}_2`, "customer.subscription.deleted", user.id, "canceled"));
    await handleStripeWebhook(del.payload, del.header);
    expect((await entitlementFor(user.id)).isPremium).toBe(false);
  });

  it("never grants an unknown plan from metadata", async () => {
    const { user } = await createLearner();
    const e = signed(subscriptionEvent(`evt_${user.id}_x`, "customer.subscription.updated", user.id, "active", "free"));
    await handleStripeWebhook(e.payload, e.header);
    const sub = await db.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.planCode).toBe("premium"); // paid status → the paid plan, never a "free" code that reads as premium
  });

  it("disables the simulator whenever real billing is configured", async () => {
    const { user } = await createLearner();
    await expect(simulateSubscription(user.id, "subscribe")).rejects.toMatchObject({ status: 403 });
  });
});

describe("development billing simulator", () => {
  it("toggles Premium only in simulation mode", async () => {
    resetEnvCache();
    const { user } = await createLearner();
    await simulateSubscription(user.id, "subscribe");
    expect((await entitlementFor(user.id)).isPremium).toBe(true);
    await simulateSubscription(user.id, "expire");
    expect((await entitlementFor(user.id)).isPremium).toBe(false);
  });
});
