import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookMarked, CheckCircle2, Circle, Flame, GraduationCap, Languages, MessagesSquare, Mic, NotebookPen, Sparkles, Trophy } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressRing, Stat } from "@/components/ui/primitives";
import { ColumnChart, MeterList } from "@/components/charts/charts";
import { RecommendationList } from "@/components/app/recommendations";
import { LANGUAGE_META } from "@/content/voices";
import { formatNumber, timeAgo } from "@/lib/format";
import { requireLearner } from "@/server/learner";
import { courseMap } from "@/server/lessons/course-map";
import { recommendationsFor } from "@/server/recommendations";
import { learnerTotals, streakFor, weeklyActivity } from "@/server/progress/stats";
import { recentMistakes, SKILL_LABEL, skillAccuracy, vocabularyEstimate } from "@/server/analytics";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const ctx = await requireLearner("/dashboard");
  const lang = ctx.enrollment.languageCode;
  const tz = ctx.prefs.timezone;
  const [map, recs, totals, streak, week, skills, mistakes, vocabEst, langXp] = await Promise.all([
    courseMap(ctx.user.id, lang, ctx.enrollment.levelCode),
    recommendationsFor(ctx.user.id, lang, ctx.enrollment.levelCode),
    learnerTotals(ctx.user.id),
    streakFor(ctx.user.id, tz),
    weeklyActivity(ctx.user.id, tz, 7),
    skillAccuracy(ctx.user.id, lang, 30),
    recentMistakes(ctx.user.id, lang, 5),
    vocabularyEstimate(ctx.user.id, lang),
    db.exerciseAttempt.count({ where: { userId: ctx.user.id, exercise: { lesson: { unit: { course: { languageCode: lang } } } } } }),
  ]);
  const meta = LANGUAGE_META[lang];
  const today = week.at(-1)!;
  const goal = ctx.prefs.dailyGoalXp;
  const isNew = langXp === 0;
  const next = map?.next;
  const weekXp = week.reduce((n, d) => n + d.xp, 0);
  const activeDays = week.filter((d) => d.xp > 0).length;

  const skillOrder = ["vocabulary", "grammar", "listening", "reading", "translation", "pronunciation", "speaking", "writing"];
  const skillData = skillOrder
    .map((s) => {
      const r = skills.find((x) => x.skill === s);
      return { label: SKILL_LABEL[s] ?? s, value: r ? r.correct / Math.max(1, r.answers) : null, detail: r ? `${r.answers} answer${r.answers === 1 ? "" : "s"}` : "—" };
    })
    .filter((d) => d.value !== null || ["vocabulary", "grammar", "listening", "pronunciation"].includes(d.label.toLowerCase()));

  return (
    <>
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{meta?.nativeName} · Level {ctx.enrollment.levelCode}</p>
          <h1 className="display mt-2 text-3xl sm:text-[2.1rem]">
            {greeting(tz)}, {ctx.user.name.split(" ")[0]}.
          </h1>
          <p className="mt-1.5 text-muted">
            {isNew
              ? "Your plan is ready. Start with your first lesson — it takes about 30 minutes."
              : streak.activeToday
                ? today.goalMet
                  ? "Daily goal reached. Anything more today is a bonus."
                  : `You've earned ${today.xp} XP today — ${Math.max(0, goal - today.xp)} to go for your goal.`
                : streak.current > 0
                  ? `Keep your ${streak.current}-day streak going with a short session today.`
                  : "Pick up where you left off."}
          </p>
        </div>
        {next && (
          <ButtonLink href={next.kind === "LEVEL_ASSESSMENT" ? `/assessments/${next.slug}` : `/learn/${next.slug}`} size="lg" className="shrink-0">
            {isNew ? "Start first lesson" : "Resume learning"} <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5"><Stat icon={<Languages className="h-4 w-4" />} label="Learning" value={meta?.name ?? lang} hint={`Level ${ctx.enrollment.levelCode}${ctx.enrollment.placementLevel ? ` · placement ${ctx.enrollment.placementLevel}` : " · self-assessed"}`} /></Card>
        <Card className="p-5"><Stat icon={<Flame className="h-4 w-4" />} label="Streak" value={`${streak.current} day${streak.current === 1 ? "" : "s"}`} hint={streak.longest ? `Longest: ${streak.longest}` : "Learn today to start one"} /></Card>
        <Card className="p-5"><Stat icon={<GraduationCap className="h-4 w-4" />} label="Lessons completed" value={formatNumber(totals.lessonsCompleted)} hint={map ? `${map.completed}/${map.total} in this level` : undefined} /></Card>
        <Card className="p-5"><Stat icon={<BookMarked className="h-4 w-4" />} label="Vocabulary (est.)" value={formatNumber(vocabEst)} hint="Words from completed lessons + reviewed notebook words" /></Card>
      </div>

      {isNew && (
        <Card className="mb-6 overflow-hidden">
          <CardHeader title="Getting started" description="Five steps to get the most out of Fluent Academy. Your statistics will appear as you learn." />
          <CardBody>
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { done: totals.lessonsCompleted > 0, title: "Complete a lesson", href: next ? `/learn/${next.slug}` : "/learn", icon: GraduationCap },
                { done: totals.placementDone > 0 || Boolean(ctx.enrollment.placementLevel), title: "Check your level", href: `/onboarding/placement?lang=${lang}`, icon: Trophy },
                { done: totals.conversations > 0, title: "Talk to the coach", href: "/coach", icon: MessagesSquare },
                { done: totals.speakingAttempts > 0, title: "Record yourself", href: "/speaking", icon: Mic },
                { done: totals.wordsSaved >= 5, title: "Save 5 words", href: "/vocabulary", icon: NotebookPen },
              ].map((s) => (
                <li key={s.title}>
                  <Link href={s.href} className="flex h-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm transition-colors hover:border-navy-200 hover:bg-navy-50/40">
                    {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success-600" /> : <Circle className="h-5 w-5 shrink-0 text-navy-200" />}
                    <span className={s.done ? "text-muted line-through" : "font-medium text-navy-900"}>{s.title}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Recommended for you" description="Based on your course position and repeated patterns in your answers." />
            <div className="mt-3 border-t border-line"><RecommendationList items={recs} /></div>
          </Card>

          <Card>
            <CardHeader
              title="This week"
              description={`${weekXp} XP across ${activeDays} active day${activeDays === 1 ? "" : "s"}`}
              action={<Link href="/progress" className="text-sm font-medium text-navy-700 hover:text-navy-900">Details</Link>}
            />
            <CardBody>
              <ColumnChart
                title="XP earned per day, last 7 days"
                unit="XP"
                goal={goal}
                goalLabel={`Daily goal ${goal}`}
                data={week.map((d, i) => ({
                  label: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d.date}T00:00:00Z`)),
                  sublabel: d.date.slice(5),
                  value: d.xp,
                  highlight: i === week.length - 1,
                  detail: `${d.lessons} lesson${d.lessons === 1 ? "" : "s"}, ${d.exercises} answers${d.goalMet ? ", goal met" : ""}`,
                }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent mistakes" description="Missed items return in your review deck." action={mistakes.length ? <Link href="/review" className="text-sm font-medium text-navy-700 hover:text-navy-900">Review</Link> : undefined} />
            <CardBody>
              {mistakes.length === 0 ? (
                <EmptyState className="py-8" icon={<Sparkles className="h-5 w-5" />} title="No mistakes recorded yet" description="When you miss an answer, it appears here with the correct version." />
              ) : (
                <ul className="divide-y divide-line">
                  {mistakes.map((m) => (
                    <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-medium text-navy-900" lang={lang}>{m.prompt}</p>
                      {m.expected && <p className="mt-0.5 text-sm"><span className="text-muted">Correct: </span><span className="text-success-700" lang={lang}>{m.expected}</span></p>}
                      <p className="mt-0.5 text-xs text-subtle">{m.lesson.title} · {timeAgo(m.at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Daily goal" description={`${ctx.prefs.dailyGoalMinutes} minutes · ${goal} XP`} action={<Link href="/settings" className="text-sm font-medium text-navy-700 hover:text-navy-900">Change</Link>} />
            <CardBody className="flex items-center gap-6">
              <ProgressRing value={today.xp} max={goal} size={96} stroke={9} label={`${today.xp} of ${goal} XP today`}>
                <span className="text-xl font-semibold text-navy-900">{today.xp}</span>
                <span className="text-[0.65rem] text-muted">/ {goal} XP</span>
              </ProgressRing>
              <div className="text-sm">
                {today.goalMet ? <Badge tone="success">Goal met today</Badge> : <p className="text-muted">{goal - today.xp} XP to go</p>}
                <p className="mt-2 text-muted">Today: {today.lessons} lesson{today.lessons === 1 ? "" : "s"}, {today.exercises} answers, {today.reviews} reviews.</p>
                <p className="mt-1 text-xs text-subtle">XP comes only from completed lessons, reviews, conversations, readings and recordings.</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Skill accuracy" description="First-try accuracy over the last 30 days." action={<Link href="/progress" className="text-sm font-medium text-navy-700 hover:text-navy-900">Analytics</Link>} />
            <CardBody>
              {skills.length === 0 ? (
                <p className="text-sm text-muted">Answer a few exercises and your accuracy by skill will appear here.</p>
              ) : (
                <MeterList data={skillData} />
              )}
            </CardBody>
          </Card>

          {map && (
            <Card>
              <CardHeader title="Course progress" description={map.course.title} />
              <CardBody>
                <ul className="space-y-2.5">
                  {map.units.filter((u) => u.order < 99).map((u) => (
                    <li key={u.slug} className="flex items-center gap-3 text-sm">
                      <span className="w-14 shrink-0 text-xs text-subtle">Unit {u.order}</span>
                      <span className="min-w-0 flex-1 truncate text-navy-900">{u.title}</span>
                      <span className="flex gap-1" aria-label={`${u.completed} of ${u.total} complete`}>
                        {Array.from({ length: u.total }, (_, i) => (
                          <span key={i} className={i < u.completed ? "h-2 w-2 rounded-full bg-navy-700" : "h-2 w-2 rounded-full bg-navy-100"} />
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
