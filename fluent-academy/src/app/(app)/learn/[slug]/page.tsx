import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { LessonPlayer } from "@/components/learning/lesson-player";
import { db } from "@/server/db";
import { getLessonForLearner } from "@/server/lessons/service";
import { requireLearner } from "@/server/learner";
import { speechClientConfig } from "@/server/speech/config";

export async function generateMetadata(props: PageProps<"/learn/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const lesson = await db.lesson.findUnique({ where: { slug }, select: { title: true } });
  return { title: lesson?.title ?? "Lesson" };
}

export default async function LessonPage(props: PageProps<"/learn/[slug]">) {
  const { slug } = await props.params;
  const ctx = await requireLearner(`/learn/${slug}`);
  const data = await getLessonForLearner(ctx.user.id, slug);
  if (!data) notFound();
  if (data.lesson.kind === "LEVEL_ASSESSMENT") redirect(`/assessments/${slug}`);
  if (!data.access.allowed) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy-900 text-gold-400"><Lock className="h-6 w-6" /></div>
        <h1 className="display mt-5 text-3xl">{data.lesson.title}</h1>
        <p className="mt-3 text-muted">{data.access.reason}</p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href="/billing" variant="gold" size="lg">See Premium</ButtonLink>
          <ButtonLink href="/learn" variant="outline" size="lg">Back to course</ButtonLink>
        </div>
      </div>
    );
  }
  const saved = await db.userVocabulary.findMany({ where: { userId: ctx.user.id, languageCode: data.lesson.language }, select: { term: true } });
  return (
    <LessonPlayer
      lesson={data.lesson}
      exercises={data.exercises}
      speech={speechClientConfig()}
      savedTerms={saved.map((s) => s.term)}
      completed={data.progress?.status === "COMPLETED"}
      bestScore={data.progress?.bestScore ?? 0}
      nextLesson={data.nextLesson}
    />
  );
}
