import type { Metadata } from "next";
import { CtaBand, Faq, PricingCards } from "@/components/marketing/sections";
import { getPlans } from "@/server/billing/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free with the first units of every level, or upgrade to Premium for the full A1–B2 academy.",
};
export const revalidate = 300;

export default async function PricingPage() {
  const plans = await getPlans();
  const free = plans.find((p) => p.code === "free");
  const premium = plans.find((p) => p.code === "premium");
  const rows: [string, string, string][] = [
    ["Curriculum", "First two units of every level", "Every unit, A1–B2"],
    ["Lessons per day", free?.limits.lessonsPerDay ? String(free.limits.lessonsPerDay) : "Unlimited", premium?.limits.lessonsPerDay ? String(premium.limits.lessonsPerDay) : "Unlimited"],
    ["AI coach conversations per day", String(free?.limits.conversationsPerDay ?? "—"), String(premium?.limits.conversationsPerDay ?? "—")],
    ["Speaking recordings per day", String(free?.limits.speakingAttemptsPerDay ?? "—"), String(premium?.limits.speakingAttemptsPerDay ?? "—")],
    ["Reading & listening library", "Selected passages", "Full library"],
    ["Vocabulary reviews", free?.limits.vocabularyReviewsPerDay ? `${free.limits.vocabularyReviewsPerDay} per day` : "Unlimited", "Unlimited"],
    ["Personalised practice", "—", "Included"],
    ["Analytics", "Basic progress", "Detailed skill analytics"],
  ];
  return (
    <>
      <section className="container-page py-16 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Pricing</p>
          <h1 className="display mt-3 text-4xl sm:text-5xl">Simple plans, no surprises.</h1>
          <p className="mt-4 text-lg text-muted">Start free with no card required. Upgrade, downgrade or cancel at any time.</p>
        </div>
        <div className="mx-auto mt-12 max-w-4xl">
          <PricingCards plans={plans} />
        </div>
      </section>
      <section className="container-page pb-16">
        <div className="mx-auto max-w-4xl overflow-x-auto rounded-[var(--radius-card)] border border-line">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Plan comparison</caption>
            <thead className="bg-navy-50/60 text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-5 py-3 font-medium" scope="col">Feature</th>
                <th className="px-5 py-3 font-medium" scope="col">Free</th>
                <th className="px-5 py-3 font-medium" scope="col">Premium</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(([f, a, b]) => (
                <tr key={f}>
                  <th scope="row" className="px-5 py-3.5 font-medium text-navy-900">{f}</th>
                  <td className="px-5 py-3.5 text-muted">{a}</td>
                  <td className="px-5 py-3.5 text-ink">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mx-auto mt-4 max-w-4xl text-xs text-subtle">
          Prices are shown in US dollars and may be subject to local taxes. Daily limits reset at midnight in your time zone.
        </p>
      </section>
      <section className="container-page pb-20" id="faq">
        <div className="mx-auto max-w-3xl">
          <h2 className="display mb-8 text-center text-3xl">Questions</h2>
          <Faq />
        </div>
      </section>
      <CtaBand />
    </>
  );
}
