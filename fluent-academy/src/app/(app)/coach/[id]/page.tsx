import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CoachChat, type ReviewData } from "@/components/coach/chat";
import { db } from "@/server/db";
import { requireLearner } from "@/server/learner";
import { serializeMessage } from "@/server/coach/service";
import { speechClientConfig } from "@/server/speech/config";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage(props: PageProps<"/coach/[id]">) {
  const { id } = await props.params;
  const ctx = await requireLearner(`/coach/${id}`);
  const conv = await db.conversation.findFirst({ where: { id, userId: ctx.user.id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!conv) notFound();
  const scenario = await db.scenario.findUnique({ where: { slug: conv.scenarioSlug } });
  const review = conv.review as unknown as ReviewData | null;
  const next = review ? await db.scenario.findUnique({ where: { slug: review.suggestedNextScenario }, select: { title: true } }) : null;
  return (
    <>
      <Link href="/coach" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-navy-900"><ArrowLeft className="h-4 w-4" /> All scenarios</Link>
      <CoachChat
        conversationId={conv.id}
        language={conv.languageCode}
        scenarioTitle={conv.title}
        goals={(scenario?.goals as string[]) ?? []}
        initialMessages={conv.messages.map((m) => serializeMessage(m))}
        isPractice={conv.isPractice}
        providerLabel={conv.provider === "anthropic" ? `AI coach · ${conv.model}` : `AI coach · ${conv.model ?? conv.provider}`}
        ended={conv.status === "ENDED"}
        review={review}
        speech={speechClientConfig()}
        correctionMode={conv.correctionMode}
        nextScenarioTitle={next?.title}
      />
    </>
  );
}
