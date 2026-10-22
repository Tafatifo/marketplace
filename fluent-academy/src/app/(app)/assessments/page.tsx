import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, Compass, Lock, RotateCcw } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { db } from "@/server/db";
import { requireLearner } from "@/server/learner";
import { formatDate } from "@/lib/format";
import { LANGUAGE_META } from "@/content/voices";

export const metadata: Metadata = { title: "Assessments" };

export default async function AssessmentsPage() {
  const ctx = await requireLearner("/assessments");
  const lang = ctx.enrollment.languageCode;
  const [placements, levelAttempts, levelLessons, reviews] = await Promise.all([
    db.assessmentAttempt.findMany({ where: { userId: ctx.user.id, languageCode: lang, kind: "PLACEMENT" }, orderBy: { createdAt: "desc" }, take: 3 }),
    db.assessmentAttempt.findMany({ where: { userId: ctx.user.id, languageCode: lang, kind: "LEVEL" }, orderBy: { createdAt: "desc" } }),
    db.lesson.findMany({ where: { kind: "LEVEL_ASSESSMENT", status: "PUBLISHED", unit: { course: { languageCode: lang } } }, include: { unit: { select: { course: { select: { levelCode: true } } } }, _count: { select: { exercises: { where: { isActive: true } } } } }, orderBy: { unit: { course: { level: { order: "asc" } } } } }),
    db.lesson.findMany({
      where: { kind: "UNIT_REVIEW", status: "PUBLISHED", unit: { course: { languageCode: lang, levelCode: ctx.enrollment.levelCode } } },
      orderBy: { unit: { order: "asc" } },
      include: { unit: { select: { title: true, order: true, isFree: true } }, progress: { where: { userId: ctx.user.id } } },
    }),
  ]);
  const placementCount = await db.placementItem.count({ where: { languageCode: lang } });
  const langName = LANGUAGE_META[lang]?.name ?? lang;
  const locked = !ctx.isPremium;
  return (
    <>
      <PageHeader eyebrow={langName} title="Assessments" description="Check your level, consolidate each unit, and confirm each CEFR level with a cumulative assessment. Results guide your learning — they are not official certificates." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Placement check" description="An adaptive check of grammar, vocabulary, reading and listening." action={<Compass className="h-5 w-5 text-gold-600" />} />
          <CardBody>
            {placements.length ? (
              <ul className="mb-4 space-y-1.5 text-sm">
                {placements.map((p) => <li key={p.id} className="flex justify-between"><span className="text-ink">Suggested <span className="font-semibold">{p.levelCode}</span></span><span className="text-muted">{formatDate(p.createdAt)} · {p.score}/{p.maxScore}</span></li>)}
              </ul>
            ) : <p className="mb-4 text-sm text-muted">Not taken yet{ctx.enrollment.placementLevel ? "" : " — your level is self-assessed"}.</p>}
            {placementCount >= 8 ? <ButtonLink href={`/onboarding/placement?lang=${lang}`} variant="outline">{placements.length ? "Retake" : "Take the placement check"} <ArrowRight className="h-4 w-4" /></ButtonLink> : <p className="text-sm text-muted">Placement items for {langName} are in preparation.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Level assessments" description="40 minutes, cumulative, 70% to confirm the level." action={<ClipboardCheck className="h-5 w-5 text-gold-600" />} />
          <CardBody>
            {levelLessons.length === 0 ? <p className="text-sm text-muted">No level assessments published yet.</p> : (
              <ul className="divide-y divide-line">
                {levelLessons.map((l) => {
                  const lvl = l.unit.course.levelCode;
                  const attempts = levelAttempts.filter((a) => a.levelCode === lvl);
                  const best = attempts.reduce((m, a) => Math.max(m, a.score / Math.max(1, a.maxScore)), 0);
                  const passed = attempts.some((a) => a.passed);
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-medium text-navy-900">{lvl} assessment</p>
                        <p className="text-xs text-muted">{l._count.exercises} questions{attempts.length ? ` · best ${Math.round(best * 100)}%` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {passed && <Badge tone="success">Confirmed</Badge>}
                        {locked ? <Badge tone="neutral"><Lock className="h-3 w-3" /> Premium</Badge> : <ButtonLink href={`/assessments/${l.slug}`} size="sm" variant={passed ? "outline" : "primary"}>{attempts.length ? "Retake" : "Start"}</ButtonLink>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={`Unit reviews · ${ctx.enrollment.levelCode}`} description="Each unit ends with a cumulative review of its vocabulary and grammar." action={<RotateCcw className="h-5 w-5 text-gold-600" />} />
          <CardBody>
            {reviews.length === 0 ? <p className="text-sm text-muted">No units published at this level yet.</p> : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {reviews.map((r) => {
                  const p = r.progress[0];
                  return (
                    <li key={r.id}>
                      <Link href={`/learn/${r.slug}`} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 hover:border-navy-200">
                        <span className="text-sm"><span className="font-medium text-navy-900">Unit {r.unit.order}</span> <span className="text-muted">· {r.unit.title}</span></span>
                        {p?.status === "COMPLETED" ? <Badge tone="success">{Math.round(p.bestScore * 100)}%</Badge> : p ? <Badge tone="navy">In progress</Badge> : <Badge tone="neutral">Not started</Badge>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
