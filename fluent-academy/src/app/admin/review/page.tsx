import Link from "next/link";
import { ContentStatusBadge, LinguisticBadge, Table } from "@/components/admin/badges";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatNumber, timeAgo } from "@/lib/format";
import { db } from "@/server/db";

export default async function ReviewQueue() {
  const [revisions, needsChanges, unreviewed, unreviewedCount, passages] = await Promise.all([
    db.lessonRevision.findMany({
      where: { status: { in: ["IN_REVIEW", "APPROVED", "DRAFT"] } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 100,
      include: { lesson: { select: { slug: true, title: true } }, author: { select: { name: true } } },
    }),
    db.lesson.findMany({ where: { linguisticStatus: "NEEDS_CHANGES" }, select: { slug: true, title: true, updatedAt: true }, take: 50 }),
    db.lesson.findMany({ where: { linguisticStatus: "AI_DRAFTED", status: "PUBLISHED", kind: "LESSON" }, orderBy: { slug: "asc" }, select: { slug: true, title: true }, take: 30 }),
    db.lesson.count({ where: { linguisticStatus: "AI_DRAFTED" } }),
    db.readingPassage.count({ where: { linguisticStatus: { in: ["AI_DRAFTED", "NEEDS_CHANGES"] } } }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Workflow" title="Review queue" description="Revisions move draft → in review → approved → published. Linguistic review is tracked separately: a lesson can be live while still awaiting a native-speaker check." />
      <Card className="mb-6">
        <CardHeader title="Revisions" description="Drafts need submitting; in-review revisions need a reviewer; approved revisions need publishing." />
        <div className="p-5 pt-4">
          {revisions.length === 0 ? (
            <EmptyState title="Nothing waiting" description="All revisions are published." />
          ) : (
            <Table>
              <thead><tr><th>Lesson</th><th>Revision</th><th>Status</th><th>Note</th><th>Created</th></tr></thead>
              <tbody>
                {revisions.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/admin/revisions/${r.id}`} className="font-medium text-navy-900 hover:underline">{r.lesson.title}</Link><p className="text-xs text-muted">{r.lesson.slug}</p></td>
                    <td className="text-sm">v{r.version} · {r.source === "IMPORT" ? "import" : r.author?.name ?? "CMS"}</td>
                    <td><ContentStatusBadge status={r.status} /></td>
                    <td className="max-w-xs text-sm text-muted">{r.note}</td>
                    <td className="text-xs text-muted">{timeAgo(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Changes requested" description="Lessons a reviewer marked as needing corrections." />
          <ul className="divide-y divide-line px-5 pb-3">
            {needsChanges.length === 0 && <li className="py-3 text-sm text-muted">None.</li>}
            {needsChanges.map((l) => (
              <li key={l.slug} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link href={`/admin/content/${l.slug}`} className="font-medium text-navy-900 hover:underline">{l.title}</Link>
                <LinguisticBadge status="NEEDS_CHANGES" />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader
            title="Awaiting native-speaker review"
            description={`${formatNumber(unreviewedCount)} lessons and ${formatNumber(passages)} passages have no recorded linguistic review.`}
          />
          <ul className="divide-y divide-line px-5 pb-3">
            {unreviewed.map((l) => (
              <li key={l.slug} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link href={`/admin/content/${l.slug}`} className="font-medium text-navy-900 hover:underline">{l.title}</Link>
                <span className="text-xs text-muted">{l.slug}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
