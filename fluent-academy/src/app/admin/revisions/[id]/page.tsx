import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ContentStatusBadge } from "@/components/admin/badges";
import { RevisionActions } from "@/components/admin/lesson-editor";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { diffLines, diffStats } from "@/lib/diff";
import { formatDate } from "@/lib/format";
import { requireStaff } from "@/server/auth/current";
import { currentSnapshot } from "@/server/content/revisions";
import { validateSnapshot } from "@/server/content/snapshot";
import { db } from "@/server/db";

export default async function RevisionPage(props: PageProps<"/admin/revisions/[id]">) {
  const user = await requireStaff();
  const { id } = await props.params;
  const rev = await db.lessonRevision.findUnique({ where: { id }, include: { lesson: { select: { slug: true, title: true } }, author: { select: { name: true } } } });
  if (!rev) notFound();
  const live = await currentSnapshot(rev.lesson.slug);
  const v = validateSnapshot(rev.snapshot);
  const before = JSON.stringify(live?.snapshot ?? {}, null, 2);
  const after = JSON.stringify(v.ok ? v.snapshot : rev.snapshot, null, 2);
  const diff = diffLines(before, after);
  const stats = diffStats(diff);

  return (
    <>
      <Link href={`/admin/content/${rev.lesson.slug}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {rev.lesson.title}
      </Link>
      <PageHeader
        eyebrow={`Revision v${rev.version}`}
        title="Changes compared with the live lesson"
        description={`${rev.source === "IMPORT" ? "Imported from /content" : `CMS edit${rev.author ? ` by ${rev.author.name}` : ""}`} · ${formatDate(rev.createdAt)}`}
      />
      <div className="-mt-4 mb-5 flex flex-wrap items-center gap-3 text-sm">
        <ContentStatusBadge status={rev.status} />
        <span className="text-success-700 tabular-nums">+{stats.added}</span>
        <span className="text-danger-700 tabular-nums">−{stats.removed}</span>
        {!v.ok && <span className="text-danger-700">This revision no longer passes validation and cannot be published.</span>}
      </div>
      {rev.note && <p className="mb-1 text-sm text-ink">“{rev.note}”</p>}
      {rev.reviewComment && <p className="mb-4 text-sm text-muted">Reviewer: “{rev.reviewComment}”</p>}
      <RevisionActions
        revision={{ id: rev.id, version: rev.version, status: rev.status, source: rev.source, note: rev.note, author: rev.author?.name ?? null, authorId: rev.authorId, reviewer: null, createdAt: rev.createdAt.toISOString(), publishedAt: null }}
        role={user.role}
        userId={user.id}
      />
      <Card className="mt-6 overflow-hidden">
        <CardBody className="p-0 sm:p-0">
          {stats.added + stats.removed === 0 ? (
            <p className="p-5 text-sm text-muted">No differences — this revision matches the live lesson.</p>
          ) : (
            <pre className="overflow-x-auto py-2 text-[0.78rem] leading-5" aria-label="Line differences">
              {diff.map((l, i) =>
                l.op === "skip" ? (
                  <div key={i} className="bg-canvas px-4 py-1 text-xs text-muted">… {l.count} unchanged lines …</div>
                ) : (
                  <div key={i} className={cn("px-4 whitespace-pre", l.op === "add" && "bg-success-50 text-success-700", l.op === "del" && "bg-danger-50 text-danger-700")}>
                    <span className="mr-3 inline-block w-3 select-none" aria-hidden>{l.op === "add" ? "+" : l.op === "del" ? "−" : " "}</span>
                    <span className="sr-only">{l.op === "add" ? "added: " : l.op === "del" ? "removed: " : ""}</span>
                    {l.text}
                  </div>
                ),
              )}
            </pre>
          )}
        </CardBody>
      </Card>
    </>
  );
}
