import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui/primitives";
import { ColumnChart, MeterList, TrendLine } from "@/components/charts/charts";
import { FocusAreas } from "@/components/progress/focus-areas";
import { db } from "@/server/db";
import { requireLearner } from "@/server/learner";
import { learnerTotals, streakFor, weeklyActivity } from "@/server/progress/stats";
import { SKILL_LABEL, skillAccuracy } from "@/server/analytics";
import { formatMinutes, formatNumber } from "@/lib/format";
import { LANGUAGE_META } from "@/content/voices";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  const ctx = await requireLearner("/progress");
  const lang = ctx.enrollment.languageCode;
  const tz = ctx.prefs.timezone;
  const detailed = ctx.plan.limits.detailedAnalytics;
  const [totals, streak, days30, skills, weaknesses, courses, weekly] = await Promise.all([
    learnerTotals(ctx.user.id),
    streakFor(ctx.user.id, tz),
    weeklyActivity(ctx.user.id, tz, 30),
    skillAccuracy(ctx.user.id, lang, 30),
    db.learnerWeakness.findMany({ where: { userId: ctx.user.id, languageCode: lang }, orderBy: [{ status: "asc" }, { score: "desc" }], take: 40 }),
    db.course.findMany({
      where: { languageCode: lang, status: "PUBLISHED" },
      orderBy: { level: { order: "asc" } },
      select: { levelCode: true, units: { select: { lessons: { where: { status: "PUBLISHED" }, select: { id: true, progress: { where: { userId: ctx.user.id, status: "COMPLETED" }, select: { id: true } } } } } } },
    }),
    detailed
      ? db.$queryRaw<{ week: Date; n: bigint; correct: bigint }[]>`
          SELECT date_trunc('week', a."createdAt") AS week, COUNT(*)::bigint AS n, SUM(CASE WHEN a."isCorrect" THEN 1 ELSE 0 END)::bigint AS correct
          FROM "ExerciseAttempt" a JOIN "Exercise" e ON e.id = a."exerciseId" JOIN "Lesson" l ON l.id = e."lessonId" JOIN "Unit" u ON u.id = l."unitId" JOIN "Course" c ON c.id = u."courseId"
          WHERE a."userId" = ${ctx.user.id} AND c."languageCode" = ${lang} AND a."createdAt" > now() - interval '12 weeks'
          GROUP BY 1 ORDER BY 1`
      : Promise.resolve([]),
  ]);
  const minutes = days30.reduce((n, d) => n + d.minutes, 0);
  const order = ["vocabulary", "grammar", "listening", "reading", "translation", "pronunciation", "speaking", "writing"];
  const order2 = { ACTIVE: 0, EMERGING: 1, IMPROVING: 2, RESOLVED: 3, DISMISSED: 4 } as const;
  return (
    <>
      <PageHeader eyebrow={LANGUAGE_META[lang]?.name} title="Your progress" description="Everything here is calculated from your real answers, completed lessons and practice — nothing is estimated unless it says so." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5"><Stat label="Total XP" value={formatNumber(totals.xp)} hint="All languages" /></Card>
        <Card className="p-5"><Stat label="Current streak" value={`${streak.current} days`} hint={`Longest ${streak.longest} days`} /></Card>
        <Card className="p-5"><Stat label="Time (30 days)" value={formatMinutes(minutes)} hint="Measured from lesson and practice sessions" /></Card>
        <Card className="p-5"><Stat label="Daily goals met" value={totals.goalsMet} /></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Activity, last 30 days" description="XP earned each day." />
          <CardBody>
            <ColumnChart
              title="XP per day, last 30 days"
              unit="XP"
              goal={ctx.prefs.dailyGoalXp}
              goalLabel={`Goal ${ctx.prefs.dailyGoalXp}`}
              height={200}
              data={days30.map((d, i) => ({ label: i % 5 === 4 || i === days30.length - 1 ? d.date.slice(8) : "", sublabel: d.date, value: d.xp, highlight: i === days30.length - 1, detail: `${d.exercises} answers, ${d.reviews} reviews` }))}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Accuracy by skill" description="First-try accuracy over the last 30 days." />
          <CardBody>
            {skills.length ? (
              <MeterList data={order.map((s) => { const r = skills.find((x) => x.skill === s); return { label: SKILL_LABEL[s] ?? s, value: r ? r.correct / Math.max(1, r.answers) : null, detail: r ? `${r.answers} answers` : "—" }; })} />
            ) : <p className="text-sm text-muted">No answers recorded in the last 30 days.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Focus areas" description="Recurring difficulties detected from repeated evidence. Dismiss any that don't reflect a real difficulty." action={<Link href="/method" className="text-sm font-medium text-navy-700 hover:underline">How this works</Link>} />
          <CardBody>
            <FocusAreas language={lang} items={[...weaknesses].sort((a, b) => order2[a.status] - order2[b.status]).map((w) => ({ id: w.id, category: w.category, label: w.label, skill: w.skill, status: w.status, errorCount: w.errorCount, successCount: w.successCount, distinctItems: w.distinctItems, streakCorrect: w.streakCorrect, lastSeenAt: w.lastSeenAt.toISOString(), examples: (w.examples as FocusExample[]) ?? [] }))} />
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Course completion" />
            <CardBody>
              <MeterList data={courses.map((c) => { const lessons = c.units.flatMap((u) => u.lessons); const done = lessons.filter((l) => l.progress.length).length; return { label: c.levelCode, value: lessons.length ? done / lessons.length : 0, detail: `${done}/${lessons.length} lessons` }; })} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Weekly accuracy trend" description="Share of first attempts answered correctly, per week." />
            <CardBody>
              {!detailed ? (
                <p className="flex items-center gap-2 text-sm text-muted"><Lock className="h-4 w-4" /> Detailed analytics are part of <Link href="/billing" className="font-medium text-navy-800 underline">Premium</Link>.</p>
              ) : weekly.length >= 2 ? (
                <TrendLine title="Weekly accuracy" data={weekly.map((w) => ({ x: w.week.toISOString().slice(5, 10), y: Number(w.correct) / Math.max(1, Number(w.n)), detail: `${Number(w.n)} answers` }))} />
              ) : <p className="text-sm text-muted">Practise over at least two weeks to see a trend.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Totals" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                {[["Lessons completed", totals.lessonsCompleted], ["Words saved", totals.wordsSaved], ["Words mastered", totals.wordsMastered], ["Conversations", totals.conversations], ["Recordings", totals.speakingAttempts], ["Passages completed", totals.readingsCompleted]].map(([k, v]) => (
                  <div key={k as string}><dt className="text-muted">{k}</dt><dd className="text-lg font-semibold text-navy-900">{v}</dd></div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

type FocusExample = { evidence: string | null; detail: string | null; at: string };
