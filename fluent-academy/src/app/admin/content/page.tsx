import Link from "next/link";
import { ContentStatusBadge, LinguisticBadge } from "@/components/admin/badges";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { LANGUAGE_META } from "@/content/voices";
import { db } from "@/server/db";

export default async function ContentPage(props: PageProps<"/admin/content">) {
  const sp = await props.searchParams;
  const courses = await db.course.findMany({ orderBy: [{ languageCode: "asc" }, { levelCode: "asc" }], select: { id: true, slug: true, languageCode: true, levelCode: true, title: true } });
  const selected = courses.find((c) => c.slug === sp.course) ?? courses[0];
  const units = selected
    ? await db.unit.findMany({
        where: { courseId: selected.id },
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: {
              id: true, slug: true, title: true, kind: true, status: true, linguisticStatus: true, version: true, updatedAt: true, sourceHash: true,
              _count: { select: { exercises: { where: { isActive: true } } } },
              revisions: { where: { status: { in: ["DRAFT", "IN_REVIEW", "APPROVED"] } }, select: { id: true } },
            },
          },
        },
      })
    : [];

  return (
    <>
      <PageHeader eyebrow="Curriculum" title="Courses, units and lessons" description="Lessons come from /content and can be edited here. Edits go through draft → review → approval before they are published." />
      {courses.length === 0 ? (
        <EmptyState title="No content imported yet" description="Run an import from /admin/imports or `npm run content:import`." />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Courses">
            {courses.map((c) => (
              <Link
                key={c.id}
                href={`/admin/content?course=${c.slug}`}
                role="tab"
                aria-selected={c.id === selected?.id}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium",
                  c.id === selected?.id ? "bg-navy-900 text-white" : "bg-white text-navy-800 ring-1 ring-line hover:ring-navy-200",
                )}
              >
                {LANGUAGE_META[c.languageCode]?.name ?? c.languageCode} {c.levelCode}
              </Link>
            ))}
          </div>
          <div className="space-y-5">
            {units.map((u) => (
              <Card key={u.id}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
                  <div>
                    <p className="text-xs font-medium text-muted">Unit {u.order === 99 ? "final" : u.order}</p>
                    <h2 className="text-base font-semibold text-navy-900">{u.title}</h2>
                  </div>
                  {u.isFree && <Badge tone="gold">Free plan</Badge>}
                </div>
                <ul className="divide-y divide-line">
                  {u.lessons.map((l) => (
                    <li key={l.id}>
                      <Link href={`/admin/content/${l.slug}`} className="flex flex-col gap-2 px-5 py-3 hover:bg-canvas sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-navy-900">{l.title}</p>
                          <p className="text-xs text-muted">
                            {l.slug} · v{l.version} · {l._count.exercises} exercises
                            {l.kind !== "LESSON" && ` · ${l.kind === "UNIT_REVIEW" ? "unit review" : "level exam"}`}
                            {l.sourceHash === null && " · edited in CMS"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {l.revisions.length > 0 && <Badge tone="warning">{l.revisions.length} pending</Badge>}
                          <ContentStatusBadge status={l.status} />
                          <LinguisticBadge status={l.linguisticStatus} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
