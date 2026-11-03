import { json, route } from "@/server/http";
import { handleStripeWebhook } from "@/server/billing/service";

// Stripe calls this endpoint server-to-server, so the browser origin check is skipped;
// authenticity is established by the webhook signature instead.
export const POST = route(
  async (req) => {
    const raw = await req.text();
    const result = await handleStripeWebhook(raw, req.headers.get("stripe-signature"));
    return json({ received: true, ...result });
  },
  { skipOriginCheck: true },
);
