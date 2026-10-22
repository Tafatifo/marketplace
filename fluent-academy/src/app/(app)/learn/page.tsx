import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDashed, ClipboardCheck, Lock, PlayCircle, RotateCcw } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, ProgressBar } from "@/components/ui/primitives";
import { LevelSwitcher } from "@/components/app/level-switcher";
import { cn } from "@/lib/cn";
import { courseMap, publishedLevels } from "@/server/lessons/course-map";
import { requireLearner } from "@/server/learner";
import { LANGUAGE_META } from "@/content/voices";
import type { CourseSyllabus } from "@/content/types";

export const metadata: Metadata = { title: "Course" };

export default async function LearnPage() {
  const ctx = await requireLearner("/learn");
  const lang = ctx.enrollment.languageCode;
  const [map, levels] = await Promise.all([courseMap(ctx.user.id, lang, ctx.enrollment.levelCode), publishedLevels(lang)]);
  const langName = LANGUAGE_META[lang]?.name ?? lang;

  if (!map) {
    return (
      <>
        <PageHeader eyebrow={langName} title={`Level ${ctx.enrollment.levelCode}`} actions={<LevelSwitcher language={lang} current={ctx.enrollment.levelCode} levels={levels} />} />
        <EmptyState
          icon={<CircleDashed className="h-5 w-5" />}
          title={`${langName} ${ctx.enrollment.levelCode} is in preparation`}
          description={levels.length ? `Choose one of the published levels (${levels.join(", ")}) to continue.` : "This language has no published courses yet."}
        />
      </>
    );
  }
  const syllabus = map.course.syllabus as unknown as CourseSyllabus;
  const pct = map.total ? Math.round((map.completed / map.total) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow={`${langName} · Level ${ctx.enrollment.levelCode}`}
        title={map.course.title}
        description={map.course.description}
        actions={<LevelSwitcher language={lang} current={ctx.enrollment.levelCode} levels={levels} />}
      />
      <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="card flex flex-col justify-between gap-5 p-6 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">Course progress</p>
            <p className="mt-1 text-2xl font-semibold text-navy-900 tabular-nums">{map.completed} of {map.total} lessons · {pct}%</p>
            <ProgressBar value={pct} className="mt-3" tone="gold" label="Course progress" />
          </div>
          {map.next && (
            <ButtonLink href={map.next.kind === "LEVEL_ASSESSMENT" ? `/assessments/${map.next.slug}` : `/learn/${map.next.slug}`} size="lg" className="shrink-0">
              {map.next.status === "IN_PROGRESS" ? "Resume" : "Continue"}: {map.next.title} <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          )}
        </div>
        <div className="card p-6 text-sm">
          <p className="font-semibold text-navy-900">About this level</p>
          <p className="mt-1.5 text-muted">~{syllabus.hours} hours of guided practice · {map.units.filter((u) => u.order < 99).length} units</p>
          <Link href={`/languages/${lang}`} className="mt-3 inline-flex items-center gap-1 font-medium text-navy-700 hover:text-navy-900">Full syllabus <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>

      <ol className="space-y-6">
        {map.units.map((u) => (
          <li key={u.slug} className="card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-line px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-gold-600 uppercase">{u.order < 99 ? `Unit ${u.order}` : "Final"} · {u.theme}</p>
                <h2 className="mt-1 font-serif text-xl font-semibold text-navy-900">{u.title}</h2>
                <p className="mt-1 text-sm text-muted">{u.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {u.isFree && !map.isPremium && <Badge tone="gold">Free</Badge>}
                <span className="text-sm text-muted tabular-nums">{u.completed}/{u.total}</span>
                <div className="w-24"><ProgressBar value={u.completed} max={u.total} size="sm" label={`${u.title} progress`} /></div>
              </div>
            </div>
            <ul className="divide-y divide-line">
              {u.lessons.map((l) => {
                const href = l.kind === "LEVEL_ASSESSMENT" ? `/assessments/${l.slug}` : `/learn/${l.slug}`;
                const Icon = l.locked ? Lock : l.status === "COMPLETED" ? CheckCircle2 : l.kind === "UNIT_REVIEW" ? RotateCcw : l.kind === "LEVEL_ASSESSMENT" ? ClipboardCheck : l.status === "IN_PROGRESS" ? PlayCircle : CircleDashed;
                return (
                  <li key={l.slug}>
                    <Link href={href} className={cn("flex items-center gap-4 px-6 py-4 transition-colors hover:bg-navy-50/50", l.locked && "opacity-75")}>
                      <Icon className={cn("h-5 w-5 shrink-0", l.status === "COMPLETED" ? "text-success-600" : l.locked ? "text-subtle" : "text-navy-600")} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-navy-900">{l.title}</p>
                        <p className="truncate text-sm text-muted">{l.summary}</p>
                      </div>
                      <div className="hidden shrink-0 items-center gap-2 sm:flex">
                        {l.kind === "UNIT_REVIEW" && <Badge tone="navy">Review</Badge>}
                        {l.kind === "LEVEL_ASSESSMENT" && <Badge tone="gold">Assessment</Badge>}
                        {l.status === "COMPLETED" && <span className="text-xs text-muted tabular-nums">{Math.round(l.bestScore * 100)}%</span>}
                        <span className="text-xs text-subtle">{l.minutes} min</span>
                      </div>
                      <span className="sr-only">{l.locked ? "Locked — Premium" : l.status.replace("_", " ").toLowerCase()}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
      {syllabus.plannedUnits.length > map.units.filter((u) => u.order < 99).length && (
        <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-navy-200 px-6 py-5 text-sm text-muted">
          <p className="font-medium text-navy-900">Coming to this level</p>
          <p className="mt-1">
            {syllabus.plannedUnits.filter((p) => !map.units.some((u) => u.order === p.order)).map((p) => `Unit ${p.order}: ${p.title}`).join(" · ")}
          </p>
        </div>
      )}
    </>
  );
}
