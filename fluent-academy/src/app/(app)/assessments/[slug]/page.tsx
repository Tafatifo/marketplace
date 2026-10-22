import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { LevelExam } from "@/components/assessment/level-exam";
import { requireLearner } from "@/server/learner";
import { getLessonForLearner } from "@/server/lessons/service";

export const metadata: Metadata = { title: "Level assessment" };

export default async function AssessmentPage(props: PageProps<"/assessments/[slug]">) {
  const { slug } = await props.params;
  const ctx = await requireLearner(`/assessments/${slug}`);
  const data = await getLessonForLearner(ctx.user.id, slug);
  if (!data) notFound();
  if (data.lesson.kind !== "LEVEL_ASSESSMENT") redirect(`/learn/${slug}`);
  if (!data.access.allowed) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy-900 text-gold-400"><Lock className="h-6 w-6" /></div>
        <h1 className="display mt-5 text-3xl">{data.lesson.title}</h1>
        <p className="mt-3 text-muted">{data.access.reason}</p>
        <div className="mt-8 flex justify-center gap-3"><ButtonLink href="/billing" variant="gold">See Premium</ButtonLink><ButtonLink href="/assessments" variant="outline">Back</ButtonLink></div>
      </div>
    );
  }
  const cando = data.lesson.content.blocks.find((b) => b.type === "cando");
  return (
    <LevelExam
      slug={slug}
      title={data.lesson.title}
      language={data.lesson.language}
      level={data.lesson.level}
      exercises={data.exercises.filter((e) => e.type !== "SPEAKING")}
      canDo={cando && cando.type === "cando" ? cando.items : []}
    />
  );
}
