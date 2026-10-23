import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ProductPreview } from "@/components/marketing/product-preview";
import {
  CtaBand,
  Faq,
  FeatureGrid,
  LanguageCards,
  PersonalizationSteps,
  PricingCards,
  TransparencyNote,
} from "@/components/marketing/sections";
import { getPlans } from "@/server/billing/plans";

export const revalidate = 300;

export default async function HomePage() {
  const plans = await getPlans();
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[linear-gradient(180deg,var(--color-navy-50),transparent)]" />
        <div className="container-page grid items-center gap-14 pt-14 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-28">
          <div className="animate-rise">
            <p className="eyebrow">A language academy with a personal coach</p>
            <h1 className="display mt-4 text-[2.6rem] leading-[1.08] sm:text-6xl">
              Speak with <span className="relative whitespace-nowrap">confidence<span className="absolute inset-x-0 -bottom-1 h-1.5 rounded-full bg-gold-400/70" aria-hidden /></span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Structured lessons from A1 to B2, realistic conversations with an AI coach, and speaking practice that
              remembers what you find difficult — so every session targets what you need next.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg">
                Start learning <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/features" size="lg" variant="outline">
                Explore features
              </ButtonLink>
            </div>
            <p className="mt-6 text-sm text-subtle">English · Français · Español · Deutsch — free to start, no card required.</p>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section className="bg-navy-950 py-20 text-white">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="eyebrow text-gold-400">Personalised learning</p>
            <h2 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">The platform learns what you find difficult.</h2>
            <p className="mt-4 text-navy-200">
              Most apps treat every learner the same. Fluent Academy keeps a structured record of your answers — the grammar
              you mix up, the words you forget, the sounds that aren&apos;t recognised — and uses it to choose what comes next.
            </p>
          </div>
          <div className="mt-12">
            <PersonalizationSteps />
            <TransparencyNote />
          </div>
        </div>
      </section>

      <section className="container-page py-20" id="features">
        <div className="mb-12 max-w-2xl">
          <p className="eyebrow">What&apos;s inside</p>
          <h2 className="display mt-3 text-3xl sm:text-4xl">Everything you need to move from understanding to speaking.</h2>
        </div>
        <FeatureGrid />
      </section>

      <section className="border-y border-line bg-canvas py-20">
        <div className="container-page">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-xl">
              <p className="eyebrow">Languages</p>
              <h2 className="display mt-3 text-3xl sm:text-4xl">Five languages, four levels each.</h2>
            </div>
            <ButtonLink href="/languages" variant="link">
              Compare syllabi <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
          <LanguageCards />
        </div>
      </section>

      <section className="container-page py-20" id="pricing">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="eyebrow">Pricing</p>
          <h2 className="display mt-3 text-3xl sm:text-4xl">Start free. Upgrade when you want the full academy.</h2>
        </div>
        <div className="mx-auto max-w-4xl">
          <PricingCards plans={plans} />
        </div>
      </section>

      <section className="container-page pb-20" id="faq">
        <div className="mx-auto max-w-3xl">
          <h2 className="display mb-8 text-center text-3xl">Frequently asked questions</h2>
          <Faq />
        </div>
      </section>

      <CtaBand />
    </>
  );
}
