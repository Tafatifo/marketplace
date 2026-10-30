import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader, ProgressBar } from "@/components/ui/primitives";
import { BillingActions } from "@/components/settings/billing-actions";
import { requireLearner } from "@/server/learner";
import { getPlans } from "@/server/billing/plans";
import { usageToday } from "@/server/billing/quota";
import { resolvedBillingMode } from "@/server/env";
import { formatDate, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Plan & billing" };

export default async function BillingPage(props: PageProps<"/billing">) {
  const ctx = await requireLearner("/billing");
  const { checkout } = await props.searchParams;
  const [plans, lessons, convs, speech] = await Promise.all([
    getPlans(),
    usageToday(ctx.user.id, "lesson_start"),
    usageToday(ctx.user.id, "ai_conversation"),
    usageToday(ctx.user.id, "speech_attempt"),
  ]);
  const mode = resolvedBillingMode();
  const sub = ctx.subscription;
  const premium = plans.find((p) => p.code === "premium");
  const L = ctx.plan.limits;
  const usage: [string, number, number | null][] = [
    ["New lessons started today", lessons, L.lessonsPerDay],
    ["Coach conversations today", convs, L.conversationsPerDay],
    ["Speaking recordings today", speech, L.speakingAttemptsPerDay],
  ];
  return (
    <>
      <PageHeader eyebrow="Account" title="Plan & billing" />
      {checkout === "success" && <Alert tone="success" className="mb-6">Thanks! Your payment is being confirmed — Premium activates as soon as our payment provider notifies us (usually within seconds). Refresh if it hasn&apos;t appeared yet.</Alert>}
      {checkout === "cancelled" && <Alert tone="info" className="mb-6">Checkout was cancelled. You haven&apos;t been charged.</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Current plan" action={<Badge tone={ctx.isPremium ? "gold" : "neutral"}>{ctx.plan.name}{sub?.provider === "simulation" ? " · simulated" : ""}</Badge>} />
          <CardBody className="space-y-4">
            {ctx.isPremium && sub ? (
              <p className="text-sm text-ink">
                {sub.cancelAtPeriodEnd ? "Cancels" : "Renews"} on <span className="font-medium">{sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "—"}</span>
                {sub.interval ? ` · billed ${sub.interval === "year" ? "yearly" : "monthly"}` : ""}.{sub.status === "PAST_DUE" ? " Your last payment failed — please update your payment method." : ""}
              </p>
            ) : (
              <p className="text-sm text-muted">You&apos;re on the Free plan.</p>
            )}
            <div className="space-y-3">
              {usage.map(([label, used, limit]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-sm"><span className="text-ink">{label}</span><span className="text-muted tabular-nums">{used}{limit !== null ? ` / ${limit}` : " · unlimited"}</span></div>
                  {limit !== null && <ProgressBar value={used} max={limit} size="sm" label={label} />}
                </div>
              ))}
            </div>
            <BillingActions mode={mode} isPremium={ctx.isPremium} provider={sub?.provider ?? "none"} cancelAtPeriodEnd={sub?.cancelAtPeriodEnd ?? false} />
          </CardBody>
        </Card>
        {premium && (
          <Card className="bg-navy-900 text-white ring-navy-800">
            <div className="px-6 py-6">
              <p className="eyebrow text-gold-400">Premium</p>
              <p className="mt-2 text-3xl font-semibold">{formatPrice(premium.priceMonthlyCents, premium.currency)}<span className="text-base font-normal text-navy-300"> / month</span></p>
              <p className="text-sm text-navy-300">or {formatPrice(premium.priceYearlyCents, premium.currency)} per year</p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {premium.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />{f}</li>)}
              </ul>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
