import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  BookOpenText,
  BrainCircuit,
  Check,
  GraduationCap,
  LineChart,
  MessagesSquare,
  NotebookPen,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { PlanInfo } from "@/server/billing/plans";

export const FEATURES = [
  {
    icon: GraduationCap,
    title: "A structured A1–B2 curriculum",
    body: "Units and lessons mapped to CEFR descriptors, each with clear objectives, grammar explained with worked examples, dialogues, and practice you have to actually answer.",
  },
  {
    icon: MessagesSquare,
    title: "An AI speaking coach",
    body: "Role-play realistic situations — a job interview, a hotel booking, a disagreement — at your level. Choose gentle, balanced or intensive corrections.",
  },
  {
    icon: AudioLines,
    title: "Speaking practice with honest feedback",
    body: "Record yourself, replay it, and see which words were recognised. We tell you exactly what the feedback measures — and what it can't.",
  },
  {
    icon: BookOpenText,
    title: "Graded reading and listening",
    body: "Original passages and audio scripts for every level, with glossaries, comprehension questions and one-tap saving of new words.",
  },
  {
    icon: NotebookPen,
    title: "A vocabulary notebook that schedules itself",
    body: "Words from lessons, readings and conversations go into one notebook, reviewed with spaced repetition and active recall rather than re-reading.",
  },
  {
    icon: LineChart,
    title: "Progress you can trust",
    body: "XP and streaks come from completed work, not clicks. Skill progress, recent mistakes and review needs are calculated from your real answers.",
  },
];

export function FeatureGrid() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((f) => (
        <div key={f.title} className="card p-6 transition-shadow hover:shadow-[var(--shadow-lift)]">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-white">
            <f.icon className="h-5 w-5" aria-hidden />
          </div>
          <h3 className="mt-5 text-base font-semibold text-navy-900">{f.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
        </div>
      ))}
    </div>
  );
}

export function PersonalizationSteps() {
  const steps = [
    {
      n: "01",
      title: "Learn with structure",
      body: "Each lesson teaches one communicative goal — ordering food, describing your weekend, defending an opinion — with the grammar and vocabulary it needs.",
    },
    {
      n: "02",
      title: "Practise by producing language",
      body: "You type, order, translate, write and speak. Every response is checked on the server and recorded against the skill and grammar point it tests.",
    },
    {
      n: "03",
      title: "Adapt from repeated evidence",
      body: "When the same difficulty appears several times — in lessons, conversations or speaking — it becomes a focus area that shapes your review, readings and coach scenarios.",
    },
  ];
  return (
    <ol className="grid gap-5 md:grid-cols-3">
      {steps.map((s) => (
        <li key={s.n} className="relative rounded-[var(--radius-card)] border border-white/10 bg-white/[0.04] p-6">
          <span className="font-serif text-3xl text-gold-400">{s.n}</span>
          <h3 className="mt-3 text-base font-semibold text-white">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-navy-200">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function TransparencyNote() {
  return (
    <div className="mt-8 flex flex-col gap-3 rounded-xl border border-white/10 bg-navy-900/60 p-5 text-sm text-navy-200 sm:flex-row sm:items-center">
      <BrainCircuit className="h-6 w-6 shrink-0 text-gold-400" aria-hidden />
      <p>
        Our recommendations use transparent rules, not a black box: one slip never labels you as “weak” at something,
        every focus area shows the evidence behind it, and you can dismiss any recommendation you disagree with.
      </p>
    </div>
  );
}

const LANGS = [
  { code: "en", name: "English", native: "English", blurb: "For work, study and travel — with a strong focus on natural spoken English." },
  { code: "fr", name: "French", native: "Français", blurb: "From café conversations to formal emails, with clear guidance on tu and vous." },
  { code: "es", name: "Spanish", native: "Español", blurb: "Peninsular Spanish as the model, with notes on Latin American usage." },
  { code: "de", name: "German", native: "Deutsch", blurb: "Cases, word order and separable verbs, taught step by step through real situations." },
];

export function LanguageCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {LANGS.map((l) => (
        <Link
          key={l.code}
          href={`/languages/${l.code}`}
          className="group card flex flex-col p-6 transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
        >
          <span className="font-serif text-2xl text-navy-900">{l.native}</span>
          <span className="mt-0.5 text-xs font-medium tracking-wide text-muted uppercase">{l.name} · A1–B2</span>
          <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">{l.blurb}</p>
          <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-navy-700 group-hover:text-navy-900">
            View syllabus <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  );
}

export function PricingCards({ plans }: { plans: PlanInfo[] }) {
  if (!plans.length) return null;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {plans.map((p) => {
        const premium = p.code !== "free";
        return (
          <div
            key={p.code}
            className={
              premium
                ? "relative rounded-[var(--radius-card)] bg-navy-900 p-7 text-white shadow-[var(--shadow-lift)] ring-1 ring-navy-800"
                : "card p-7"
            }
          >
            {premium && (
              <span className="absolute top-6 right-6 rounded-full bg-gold-500 px-2.5 py-1 text-[0.7rem] font-semibold text-navy-950">
                Full academy
              </span>
            )}
            <h3 className={premium ? "font-serif text-2xl text-white" : "font-serif text-2xl text-navy-900"}>{p.name}</h3>
            <p className={premium ? "mt-1.5 text-sm text-navy-200" : "mt-1.5 text-sm text-muted"}>{p.description}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">
                {p.priceMonthlyCents === 0 ? formatPrice(0, p.currency) : formatPrice(p.priceMonthlyCents, p.currency)}
              </span>
              <span className={premium ? "text-sm text-navy-300" : "text-sm text-muted"}>{p.priceMonthlyCents === 0 ? "forever" : "/ month"}</span>
            </p>
            {p.priceYearlyCents > 0 && (
              <p className="mt-1 text-xs text-navy-300">or {formatPrice(p.priceYearlyCents, p.currency)} billed yearly</p>
            )}
            <ul className="mt-6 space-y-3 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check className={premium ? "mt-0.5 h-4 w-4 shrink-0 text-gold-400" : "mt-0.5 h-4 w-4 shrink-0 text-navy-700"} aria-hidden />
                  <span className={premium ? "text-navy-100" : "text-ink"}>{f}</span>
                </li>
              ))}
            </ul>
            <ButtonLink
              href={premium ? "/signup?plan=premium" : "/signup"}
              variant={premium ? "gold" : "primary"}
              className="mt-8 w-full"
              size="lg"
            >
              {premium ? "Start with Premium" : "Start learning free"}
            </ButtonLink>
          </div>
        );
      })}
    </div>
  );
}

export const FAQ_ITEMS = [
  {
    q: "Who is Fluent Academy for?",
    a: "It is designed above all for learners who understand some of a language but struggle to speak it naturally — typically around A2–B1. Complete beginners can start at A1, and the curriculum continues to B2.",
  },
  {
    q: "Which languages can I learn?",
    a: "English, French, Spanish and German, each from A1 to B2. Instructions and explanations are written in English; the AI coach can explain its corrections in your native language.",
  },
  {
    q: "How does the AI coach work?",
    a: "You choose a scenario and talk (by typing or speaking) with a tutor that adapts to your level. It corrects important mistakes according to the correction mode you choose, introduces useful vocabulary, and writes a structured review when you finish. When no AI provider is connected, a clearly labelled practice mode uses scripted conversations instead.",
  },
  {
    q: "Does the speaking feedback measure my pronunciation precisely?",
    a: "Only when a pronunciation-assessment service is connected. Otherwise, feedback compares a speech-recognition transcript with the target sentence. That tells you which words were understood — a useful measure of intelligibility — but it is not a phonetic score, and accents, background noise and microphone quality all affect recognition.",
  },
  {
    q: "What happens to my recordings?",
    a: "Recordings are stored privately and deleted automatically after 30 days by default. You can shorten that, turn storage off so only transcripts are kept, or delete all recordings at any time from Settings.",
  },
  {
    q: "Will I be certified at a CEFR level?",
    a: "No. Our levels and assessments are mapped to CEFR descriptors to guide your learning, but Fluent Academy is not an examination body. For an official certificate, take a recognised exam such as DELF, DELE, Goethe-Zertifikat or Cambridge English.",
  },
  {
    q: "Can I cancel Premium?",
    a: "Yes. Premium renews monthly or yearly and can be cancelled at any time from the billing page; you keep access until the end of the paid period.",
  },
];

export function Faq() {
  return (
    <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
      {FAQ_ITEMS.map((f) => (
        <details key={f.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[0.95rem] font-medium text-navy-900">
            {f.q}
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-transform group-open:rotate-45" aria-hidden>
              +
            </span>
          </summary>
          <p className="mt-3 pr-10 text-sm leading-relaxed text-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function CtaBand() {
  return (
    <section className="container-page pb-20">
      <div className="relative overflow-hidden rounded-[1.5rem] bg-navy-900 px-8 py-14 text-center sm:px-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_80%_at_85%_0%,rgb(194_155_63/0.25),transparent),radial-gradient(40%_60%_at_0%_100%,rgb(58_98_159/0.45),transparent)]" />
        <div className="relative">
          <h2 className="font-serif text-3xl font-semibold text-white sm:text-4xl">Your next conversation starts here.</h2>
          <p className="mx-auto mt-3 max-w-xl text-navy-200">
            Take a short placement check, get a personalised plan, and have your first coached conversation today.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/signup" variant="gold" size="lg">
              Start learning
            </ButtonLink>
            <ButtonLink href="/features" variant="outline" size="lg" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              Explore features
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
