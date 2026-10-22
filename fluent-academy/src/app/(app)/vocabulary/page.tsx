import type { Metadata } from "next";
import { BookMarked, Brain, CalendarClock, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader, Stat } from "@/components/ui/primitives";
import { Notebook } from "@/components/vocabulary/notebook";
import { db } from "@/server/db";
import { requireLearner } from "@/server/learner";

export const metadata: Metadata = { title: "Vocabulary notebook" };

export default async function VocabularyPage() {
  const ctx = await requireLearner("/vocabulary");
  const lang = ctx.enrollment.languageCode;
  const words = await db.userVocabulary.findMany({
    where: { userId: ctx.user.id, languageCode: lang },
    orderBy: { createdAt: "desc" },
    include: { reviews: { select: { correct: true } } },
  });
  const now = new Date();
  const due = words.filter((w) => w.status !== "SUSPENDED" && w.dueAt <= now).length;
  const mastered = words.filter((w) => w.status === "MASTERED").length;
  const learning = words.filter((w) => w.status === "LEARNING" || w.status === "NEW").length;
  return (
    <>
      <PageHeader
        eyebrow="Practise"
        title="Vocabulary notebook"
        description="Every word you save, with its context. Reviews are scheduled with spaced repetition and ask you to produce the word, not just recognise it."
        actions={<ButtonLink href="/review" size="lg" variant={due ? "primary" : "outline"}>{due ? `Review ${due} due` : "Open review"}</ButtonLink>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5"><Stat icon={<BookMarked className="h-4 w-4" />} label="Saved" value={words.length} /></Card>
        <Card className="p-5"><Stat icon={<CalendarClock className="h-4 w-4" />} label="Due now" value={due} /></Card>
        <Card className="p-5"><Stat icon={<Sparkles className="h-4 w-4" />} label="Learning" value={learning} /></Card>
        <Card className="p-5"><Stat icon={<Brain className="h-4 w-4" />} label="Mastered" value={mastered} hint="Interval of 21 days or more" /></Card>
      </div>
      <Notebook
        language={lang}
        words={words.map((w) => ({
          id: w.id,
          term: w.term,
          translation: w.translation,
          example: w.example,
          notes: w.notes,
          status: w.status,
          sourceType: w.sourceType,
          sourceContext: w.sourceContext,
          dueAt: w.dueAt.toISOString(),
          intervalDays: w.intervalDays,
          audioKey: w.audioKey,
          reviews: w.reviews.length,
          correctRate: w.reviews.length ? w.reviews.filter((r) => r.correct).length / w.reviews.length : null,
        }))}
      />
    </>
  );
}
