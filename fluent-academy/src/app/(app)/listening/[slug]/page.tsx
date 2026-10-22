import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Reader, type ReaderPassage } from "@/components/reading/reader";
import { requireLearner } from "@/server/learner";
import { loadPassage } from "@/server/passages";

export const metadata: Metadata = { title: "Listening library" };

export default async function PassagePage(props: PageProps<"/listening/[slug]">) {
  const { slug } = await props.params;
  const ctx = await requireLearner(`/listening/${slug}`);
  const data = await loadPassage(slug, ctx.user.id);
  if (!data || data.passage.kind !== "LISTENING") notFound();
  if (data.locked) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy-900 text-gold-400"><Lock className="h-6 w-6" /></div>
        <h1 className="display mt-5 text-3xl">{data.passage.title}</h1>
        <p className="mt-3 text-muted">This passage is part of the full library on Premium.</p>
        <div className="mt-8 flex justify-center gap-3"><ButtonLink href="/billing" variant="gold">See Premium</ButtonLink><ButtonLink href="/listening" variant="outline">Back to library</ButtonLink></div>
      </div>
    );
  }
  return (
    <>
      <Link href="/listening" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-navy-900"><ArrowLeft className="h-4 w-4" /> Listening library</Link>
      <Reader passage={data.passage as ReaderPassage} completed={data.progress?.status === "COMPLETED"} bestScore={data.progress?.comprehensionScore ?? null} />
    </>
  );
}
