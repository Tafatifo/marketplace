import type { Metadata } from "next";
import Link from "next/link";
import { Bot, MessagesSquare } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { ScenarioPicker } from "@/components/coach/scenario-picker";
import { db } from "@/server/db";
import { requireLearner } from "@/server/learner";
import { listScenarios } from "@/server/coach/service";
import { getLanguageModel } from "@/server/ai/provider";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "AI coach" };

export default async function CoachPage(props: PageProps<"/coach">) {
  const ctx = await requireLearner("/coach");
  const { scenario, passage } = await props.searchParams;
  const lang = ctx.enrollment.languageCode;
  const [scenarios, recent] = await Promise.all([
    listScenarios(lang, ctx.enrollment.levelCode),
    db.conversation.findMany({ where: { userId: ctx.user.id, languageCode: lang }, orderBy: { startedAt: "desc" }, take: 8, include: { _count: { select: { messages: { where: { role: "USER" } } } } } }),
  ]);
  const model = getLanguageModel();
  const restricted = ctx.plan.limits.freeUnitsOnly && !ctx.isPremium;
  const passageRow = typeof passage === "string" ? await db.readingPassage.findUnique({ where: { slug: passage }, select: { slug: true, title: true } }) : null;
  return (
    <>
      <PageHeader
        eyebrow="Practise"
        title="AI speaking coach"
        description="Choose a situation and talk it through. The coach adapts to your level, uses what you're learning, and reviews the conversation at the end."
      />
      <div className={model ? "mb-6 flex items-start gap-3 rounded-xl border border-navy-100 bg-navy-50 px-4 py-3 text-sm text-navy-900" : "mb-6 flex items-start gap-3 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-700"}>
        <Bot className="mt-0.5 h-4 w-4 shrink-0" />
        {model ? (
          <p>Live AI coach connected ({model.provider === "anthropic" ? "Anthropic Claude" : "OpenAI-compatible model"} · <code className="text-xs">{model.model}</code>). Corrections and reviews are AI-generated and may occasionally be wrong.</p>
        ) : (
          <p><strong>Practice mode.</strong> No AI provider is configured on this server, so conversations follow a scripted tutor with rule-based checks for common mistakes. An administrator can connect Anthropic or an OpenAI-compatible model to enable the live coach.</p>
        )}
      </div>
      {passageRow && <p className="mb-4 text-sm text-ink">Discussing the text <span className="font-medium">“{passageRow.title}”</span>. Pick a scenario — “Expressing an opinion” works well.</p>}
      <ScenarioPicker
        scenarios={scenarios.map((s) => ({ slug: s.slug, title: s.title, description: s.description, category: s.category, minLevel: s.minLevel, maxLevel: s.maxLevel, fits: s.fits, isFree: s.isFree, locked: restricted && !s.isFree, goals: s.goals as string[] }))}
        defaultMode={ctx.prefs.correctionMode}
        preselect={typeof scenario === "string" ? scenario : undefined}
        passageSlug={passageRow?.slug}
      />
      <Card className="mt-8">
        <CardHeader title="Your conversations" description="Reopen a conversation to read it again or see its review." />
        <CardBody>
          {recent.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted"><MessagesSquare className="h-4 w-4" /> No conversations yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((c) => (
                <li key={c.id}>
                  <Link href={`/coach/${c.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-navy-900">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-navy-900">{c.title}</p>
                      <p className="text-xs text-muted">{timeAgo(c.startedAt)} · {c._count.messages} message{c._count.messages === 1 ? "" : "s"} · {c.correctionMode.toLowerCase()}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {c.isPractice && <Badge tone="gold">Practice</Badge>}
                      <Badge tone={c.status === "ENDED" ? "success" : "navy"}>{c.status === "ENDED" ? "Reviewed" : "In progress"}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
