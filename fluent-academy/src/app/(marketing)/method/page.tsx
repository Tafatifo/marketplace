import type { Metadata } from "next";
import { CtaBand } from "@/components/marketing/sections";

export const metadata: Metadata = {
  title: "How Fluent Academy adapts",
  description: "How the learner record works: what we track, how repeated evidence becomes a focus area, and how recommendations are chosen.",
};

const TRACKED = [
  ["Grammar", "Which grammar point an exercise or correction relates to — for example, the auxiliary in the French passé composé."],
  ["Vocabulary", "Words you get wrong in lessons or forget in review, and words you save from readings and conversations."],
  ["Translation", "Repeated problems when moving between English and your target language."],
  ["Listening", "Dictation and listening-comprehension answers, word by word."],
  ["Pronunciation", "Words that speech recognition repeatedly fails to recognise in your recordings."],
  ["Mastery", "Lessons completed, assessments passed, and focus areas you have since answered correctly several times in a row."],
];

const RULES = [
  {
    title: "Evidence, not a single slip",
    body: "A difficulty becomes an active focus area only after at least three errors on different items, across two or more sessions, within the last 30 days. A single mistake is recorded but never acted on alone.",
  },
  {
    title: "Improvement counts too",
    body: "Correct answers on the same point reduce the strength of a focus area. Three in a row mark it as improving; sustained success resolves it.",
  },
  {
    title: "You stay in control",
    body: "Every focus area shows the examples behind it. If it's wrong — a typo, a misheard recording — dismiss it and it stops shaping your recommendations.",
  },
  {
    title: "Recommendations you can read",
    body: "Your next lesson follows the curriculum sequence. Review sessions, readings and coach scenarios are chosen to match active focus areas, and each recommendation says why it was chosen.",
  },
];

export default function MethodPage() {
  return (
    <>
      <section className="container-page py-16 lg:py-20">
        <div className="max-w-3xl">
          <p className="eyebrow">Method</p>
          <h1 className="display mt-3 text-4xl sm:text-5xl">Personalisation you can understand.</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Fluent Academy keeps a structured learner record. Every answer you give — in a lesson, a review, a reading, a
            conversation or a recording — is stored against the language, skill and point it tests. Simple, documented
            rules turn that record into your next steps.
          </p>
        </div>
      </section>
      <section className="border-y border-line bg-canvas py-16">
        <div className="container-page">
          <h2 className="display text-2xl sm:text-3xl">What we track</h2>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRACKED.map(([t, d]) => (
              <div key={t} className="card p-5">
                <dt className="font-semibold text-navy-900">{t}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section className="container-page py-16">
        <h2 className="display text-2xl sm:text-3xl">The rules</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {RULES.map((r, i) => (
            <div key={r.title} className="flex gap-5 rounded-[var(--radius-card)] border border-line p-6">
              <span className="font-serif text-3xl leading-none text-gold-500">{i + 1}</span>
              <div>
                <h3 className="font-semibold text-navy-900">{r.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{r.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 rounded-[var(--radius-card)] bg-navy-50 p-6 text-sm leading-relaxed text-navy-900">
          <h3 className="font-semibold">About AI-generated content and feedback</h3>
          <p className="mt-2">
            Parts of the curriculum were drafted with AI assistance and are marked for review by language specialists in our
            editorial workflow; we do not present AI-drafted material as professionally verified. AI coach feedback can be
            wrong — corrections come with explanations so you can judge them, and you can always flag a focus area as incorrect.
          </p>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
