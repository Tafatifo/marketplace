import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LinguisticBadge } from "@/components/admin/badges";
import { LinguisticReviewForm } from "@/components/admin/lesson-editor";
import { AudioButton } from "@/components/learning/audio";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { formatDate } from "@/lib/format";
import { checkPassage } from "@/content/qa";
import type { PassageDef } from "@/content/types";
import { requireStaff } from "@/server/auth/current";
import { db } from "@/server/db";

interface StoredQuestion {
  id: string;
  type: string;
  prompt: { question?: string; options?: string[]; sentence?: string };
  answer: { correct?: number; accepted?: string[]; blanks?: string[][] };
  explanation: string;
}

export default async function PassageAdmin(props: PageProps<"/admin/passages/[slug]">) {
  const user = await requireStaff();
  const { slug } = await props.params;
  const p = await db.readingPassage.findUnique({ where: { slug } });
  if (!p) notFound();
  const reviews = await db.contentReview.findMany({ where: { entityType: "PASSAGE", entityId: p.id }, orderBy: { createdAt: "desc" }, include: { reviewer: { select: { name: true } } } });
  const stored = p.questions as unknown as { items: StoredQuestion[] };
  const glossary = p.glossary as { term: string; translation: string; note?: string }[];
  const issues = checkPassage({
    slug: p.slug, level: p.levelCode, wordCount: p.wordCount, questions: stored.items, glossary, audio: p.audioKey ? { key: p.audioKey } : undefined,
  } as unknown as PassageDef);
  const canReview = user.role === "ADMIN" || user.role === "REVIEWER";
  return (
    <>
      <Link href="/admin/passages" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Passages
      </Link>
      <PageHeader eyebrow={`${p.languageCode.toUpperCase()} ${p.levelCode} · ${p.kind === "READING" ? "Reading" : "Listening"}`} title={p.title} description={p.summary} />
      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-2 text-sm">
        <LinguisticBadge status={p.linguisticStatus} />
        <Badge tone="outline">{p.wordCount} words</Badge>
        {p.audioKey && <AudioButton audio={{ key: p.audioKey }} lang={p.languageCode} label="Play narration" showSlow={false} />}
      </div>
      {issues.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="QA findings" />
          <CardBody>
            <ul className="space-y-1 text-sm">
              {issues.map((i, n) => <li key={n} className={i.severity === "error" ? "text-danger-700" : "text-warning-700"}>{i.message}</li>)}
            </ul>
          </CardBody>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Text" />
            <CardBody className="reading-text space-y-4 whitespace-pre-line" lang={p.languageCode}>{p.body}</CardBody>
          </Card>
          {p.translation && (
            <Card>
              <CardHeader title="Translation" />
              <CardBody className="space-y-4 text-sm whitespace-pre-line text-muted">{p.translation}</CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title={`Questions (${stored.items.length})`} description="With answer keys — not visible to learners." />
            <CardBody>
              <ol className="list-decimal space-y-3 pl-5 text-sm">
                {stored.items.map((q) => (
                  <li key={q.id}>
                    <p className="text-ink">{q.prompt.question ?? q.prompt.sentence}</p>
                    {q.prompt.options && <p className="text-muted">{q.prompt.options.map((o, i) => (i === q.answer.correct ? `✓ ${o}` : o)).join(" · ")}</p>}
                    {q.answer.accepted && <p className="text-success-700">{q.answer.accepted.join(" | ")}</p>}
                    {q.answer.blanks && <p className="text-success-700">{q.answer.blanks.map((b) => b.join(" | ")).join(" ; ")}</p>}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Glossary" />
            <CardBody>
              <dl className="space-y-2 text-sm">
                {glossary.map((g) => (
                  <div key={g.term}><dt className="font-medium text-navy-900" lang={p.languageCode}>{g.term}</dt><dd className="text-muted">{g.translation}{g.note && ` — ${g.note}`}</dd></div>
                ))}
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Linguistic review" />
            <CardBody>
              {canReview ? <LinguisticReviewForm entityType="PASSAGE" entityId={p.id} current={p.linguisticStatus} /> : <p className="text-sm text-muted">Only reviewers can record reviews.</p>}
              {reviews.length > 0 && (
                <ol className="mt-6 space-y-3 border-t border-line pt-4">
                  {reviews.map((r) => (
                    <li key={r.id} className="text-sm">
                      <div className="flex items-center gap-2"><LinguisticBadge status={r.status} /><span className="text-xs text-muted">{r.reviewer.name} · {formatDate(r.createdAt)}</span></div>
                      <p className="mt-1 whitespace-pre-line">{r.comment}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
