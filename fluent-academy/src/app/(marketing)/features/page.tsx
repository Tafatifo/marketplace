import type { Metadata } from "next";
import { AudioLines, BookOpenText, ClipboardCheck, MessagesSquare, NotebookPen, Target } from "lucide-react";
import { CtaBand, FeatureGrid } from "@/components/marketing/sections";
import { ProductPreview } from "@/components/marketing/product-preview";

export const metadata: Metadata = {
  title: "Features",
  description: "Lessons, AI conversation practice, speaking feedback, graded reading, spaced-repetition vocabulary and honest progress tracking.",
};

const DEEP_DIVES = [
  {
    icon: ClipboardCheck,
    title: "Lessons that make you produce language",
    points: [
      "Each lesson combines vocabulary, grammar in context, a dialogue or text, pronunciation and a real-world task.",
      "Ten exercise types — from sentence ordering and matching to dictation, translation, speaking and writing.",
      "Answers are checked on the server with tolerance for typos, but accents and grammar still count.",
      "Every unit ends with a cumulative review and every level with an assessment mapped to its objectives.",
    ],
  },
  {
    icon: MessagesSquare,
    title: "A coach that knows your course",
    points: [
      "Scenarios from introducing yourself to negotiating in a meeting, filtered to your level.",
      "The coach uses the vocabulary and grammar from your current unit, and the difficulties in your learner record.",
      "Gentle, balanced or intensive corrections — with explanations in your own language if you prefer.",
      "After every conversation: key mistakes, corrected sentences, new vocabulary and a suggested next step.",
    ],
  },
  {
    icon: AudioLines,
    title: "Speaking practice, explained honestly",
    points: [
      "Record, replay and compare with native-model audio at normal or slow speed.",
      "Word-by-word feedback shows what speech recognition understood — useful for intelligibility.",
      "Where a pronunciation-assessment service is connected, you also get accuracy and fluency scores from it.",
      "Recordings are private, deleted after 30 days by default, and removable at any time.",
    ],
  },
  {
    icon: BookOpenText,
    title: "A graded library",
    points: [
      "Original reading passages and listening scripts written for each CEFR level.",
      "Glossaries, translations and comprehension questions, with audio for every passage.",
      "Write a short summary and talk about the text with the coach afterwards.",
    ],
  },
  {
    icon: NotebookPen,
    title: "Vocabulary that comes back at the right time",
    points: [
      "Save words from lessons, readings and conversations into one notebook, with their original context.",
      "Spaced repetition schedules each word; reviews ask you to recall and type, not just recognise.",
    ],
  },
  {
    icon: Target,
    title: "Goals and progress without gimmicks",
    points: [
      "Daily goals, streaks, achievements and weekly summaries — all earned from completed work.",
      "Skill-by-skill progress and a transparent list of focus areas with the evidence behind them.",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="border-b border-line bg-[linear-gradient(180deg,var(--color-navy-50),#fff)]">
        <div className="container-page grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="eyebrow">Features</p>
            <h1 className="display mt-3 text-4xl sm:text-5xl">An academy, a tutor and a practice partner — in one place.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Fluent Academy pairs a carefully sequenced curriculum with conversation and speaking practice, and connects
              them through a record of what you find difficult.
            </p>
          </div>
          <ProductPreview />
        </div>
      </section>
      <section className="container-page py-20">
        <FeatureGrid />
      </section>
      <section className="container-page pb-20">
        <div className="grid gap-6 lg:grid-cols-2">
          {DEEP_DIVES.map((d) => (
            <div key={d.title} className="card p-7">
              <div className="flex items-center gap-3">
                <d.icon className="h-5 w-5 text-gold-600" aria-hidden />
                <h2 className="text-lg font-semibold text-navy-900">{d.title}</h2>
              </div>
              <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted">
                {d.points.map((p) => (
                  <li key={p} className="flex gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-navy-300" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
