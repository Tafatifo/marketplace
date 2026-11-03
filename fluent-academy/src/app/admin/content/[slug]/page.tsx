import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { ContentStatusBadge, LinguisticBadge, Table } from "@/components/admin/badges";
import {
  LessonJsonEditor,
  LessonPreview,
  LessonTabs,
  LinguisticReviewForm,
  RevisionActions,
  ValidState,
  type RevisionRow,
} from "@/components/admin/lesson-editor";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { formatDate, timeAgo } from "@/lib/format";
import { summarizeExercise } from "@/content/summary";
import type { ExerciseDef, LessonBlock } from "@/content/types";
import { LANGUAGE_META } from "@/content/voices";
import { requireStaff } from "@/server/auth/current";
import { currentSnapshot } from "@/server/content/revisions";
import { validateSnapshot } from "@/server/content/snapshot";
import { db } from "@/server/db";

export default async function AdminLessonPage(props: PageProps<"/admin/content/[slug]">) {
  const user = await requireStaff();
  const { slug } = await props.params;
  const [lesson, current] = await Promise.all([
    db.lesson.findUnique({
      where: { slug },
      include: {
        unit: { include: { course: true } },
        revisions: { orderBy: { version: "desc" }, take: 30, include: { author: { select: { name: true } }, reviewer: { select: { name: true } } } },
        _count: { select: { progress: true } },
      },
    }),
    currentSnapshot(slug),
  ]);
  if (!lesson || !current) notFound();
  const reviews = await db.contentReview.findMany({ where: { entityType: "LESSON", entityId: lesson.id }, orderBy: { createdAt: "desc" }, include: { reviewer: { select: { name: true } } } });
  const qa = validateSnapshot(current.snapshot);
  const issues = qa.ok ? qa.warnings : qa.issues;
  const errors = issues.filter((i) => i.severity === "error").length;
  const lang = lesson.unit.course.languageCode;
  const canEdit = user.role === "ADMIN" || user.role === "EDITOR";
  const canReview = user.role === "ADMIN" || user.role === "REVIEWER";
  const revisions: RevisionRow[] = lesson.revisions.map((r) => ({
    id: r.id, version: r.version, status: r.status, source: r.source, note: r.note, reviewComment: r.reviewComment, author: r.author?.name ?? null, authorId: r.authorId,
    reviewer: r.reviewer?.name ?? null, createdAt: r.createdAt.toISOString(), publishedAt: r.publishedAt?.toISOString() ?? null,
  }));
  const exercises = current.snapshot.exercises as ExerciseDef[];

  return (
    <>
      <Link href={`/admin/content?course=${lesson.unit.course.slug}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {LANGUAGE_META[lang]?.name} {lesson.unit.course.levelCode} · {lesson.unit.title}
      </Link>
      <PageHeader
        title={lesson.title}
        description={lesson.summary}
        actions={
          <a href={`/api/admin/lessons/${slug}/export`} className={buttonClasses({ variant: "outline", size: "sm" })}>
            <Download className="h-4 w-4" aria-hidden /> Export JSON
          </a>
        }
      />
      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-2 text-sm">
        <ContentStatusBadge status={lesson.status} />
        <LinguisticBadge status={lesson.linguisticStatus} />
        <ValidState errors={errors} warnings={issues.length - errors} />
        <Badge tone="outline">v{lesson.version}</Badge>
        <span className="text-muted">
          {slug} · {exercises.length} exercises · {lesson._count.progress} learners started · updated {timeAgo(lesson.updatedAt)}
          {lesson.sourceHash === null && " · edited in CMS (imports will queue for review instead of overwriting)"}
        </span>
      </div>

      <LessonTabs
        tabs={[
          {
            value: "preview",
            label: "Preview",
            content: (
              <div className="max-w-3xl">
                <LessonPreview blocks={(current.snapshot.content as { blocks: LessonBlock[] }).blocks} language={lang} lessonId={lesson.id} />
              </div>
            ),
          },
          {
            value: "exercises",
            label: "Exercises",
            count: exercises.length,
            content: (
              <>
                {issues.length > 0 && (
                  <Card className="mb-4">
                    <CardHeader title="QA findings" description="Automatic checks on structure and answer keys. They do not judge linguistic quality." />
                    <CardBody>
                      <ul className="space-y-1 text-sm">
                        {issues.map((i, n) => (
                          <li key={n} className={i.severity === "error" ? "text-danger-700" : "text-warning-700"}>
                            <code className="text-xs">{i.where}</code> {i.message}
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                )}
                <Table>
                  <thead>
                    <tr><th>#</th><th>Type</th><th>Prompt</th><th>Answer key</th><th>Tags</th></tr>
                  </thead>
                  <tbody>
                    {exercises.map((e) => {
                      const s = summarizeExercise(e.prompt, e.answer);
                      return (
                        <tr key={e.key} className="align-top">
                          <td className="text-xs text-muted tabular-nums">{e.order}</td>
                          <td>
                            <p className="text-xs font-medium text-navy-900">{e.type.replace("_", " ").toLowerCase()}</p>
                            <p className="text-xs text-muted">{e.skill}{e.derived && " · derived"}</p>
                          </td>
                          <td className="max-w-sm text-sm">{s.prompt}</td>
                          <td className="max-w-xs text-sm text-success-700">{s.answer}</td>
                          <td className="max-w-[10rem] text-xs text-muted">{e.tags.join(", ")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </>
            ),
          },
          {
            value: "edit",
            label: "Edit",
            content: <LessonJsonEditor slug={slug} initial={current.snapshot} canEdit={canEdit} />,
          },
          {
            value: "revisions",
            label: "Revisions",
            count: revisions.length,
            content: (
              <ol className="space-y-3">
                {revisions.map((r) => (
                  <li key={r.id}>
                    <Card>
                      <CardBody>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-navy-900">v{r.version}</span>
                          <ContentStatusBadge status={r.status} />
                          <Badge tone="outline">{r.source === "IMPORT" ? "From /content" : "CMS edit"}</Badge>
                          <span className="text-xs text-muted">
                            {r.author ? `by ${r.author} · ` : ""}
                            {formatDate(r.createdAt)}
                            {r.reviewer && ` · reviewed by ${r.reviewer}`}
                            {r.publishedAt && ` · published ${formatDate(r.publishedAt)}`}
                          </span>
                          <Link href={`/admin/revisions/${r.id}`} className="ml-auto text-sm font-medium text-navy-700 hover:underline">
                            Compare with live
                          </Link>
                        </div>
                        {r.note && <p className="mt-2 text-sm text-ink">{r.note}</p>}
                        {r.reviewComment && <p className="mt-1 text-sm text-muted">Reviewer: “{r.reviewComment}”</p>}
                        <RevisionActions revision={r} role={user.role} userId={user.id} />
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ol>
            ),
          },
          {
            value: "linguistic",
            label: "Linguistic review",
            count: reviews.length,
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Record a review" description="Content drafted with AI assistance is never treated as verified until a qualified reviewer signs it off here." />
                  <CardBody>
                    {canReview ? (
                      <LinguisticReviewForm entityType="LESSON" entityId={lesson.id} current={lesson.linguisticStatus} />
                    ) : (
                      <p className="text-sm text-muted">Only reviewers can record linguistic reviews.</p>
                    )}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="History" />
                  <CardBody>
                    {reviews.length === 0 ? (
                      <p className="text-sm text-muted">No reviews yet.</p>
                    ) : (
                      <ol className="space-y-4">
                        {reviews.map((r) => (
                          <li key={r.id} className="text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <LinguisticBadge status={r.status} />
                              <span className="text-xs text-muted">{r.reviewer.name} · {formatDate(r.createdAt)}</span>
                            </div>
                            <p className="mt-1 whitespace-pre-line text-ink">{r.comment}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardBody>
                </Card>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
