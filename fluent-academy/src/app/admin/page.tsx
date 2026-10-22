import Link from "next/link";
import { AlertTriangle, AudioLines, BookOpenText, ClipboardCheck, GraduationCap, Users } from "lucide-react";
import { StateDot } from "@/components/admin/badges";
import { Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui/primitives";
import { formatNumber, timeAgo } from "@/lib/format";
import { systemStatus } from "@/server/admin/status";
import { db } from "@/server/db";

export default async function AdminOverview() {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [status, users, activeLearners, premium, lessonsByStatus, linguistic, pendingRevisions, audioQa, audioVerdicts, events, lastImport] = await Promise.all([
    systemStatus(),
    db.user.count(),
    db.dailyActivity.groupBy({ by: ["userId"], where: { date: { gte: weekAgo } } }).then((r) => r.length),
    db.subscription.count({ where: { planCode: { not: "free" }, status: { in: ["ACTIVE", "TRIALING"] } } }),
    db.lesson.groupBy({ by: ["status"], _count: true }),
    db.lesson.groupBy({ by: ["linguisticStatus"], _count: true }),
    db.lessonRevision.count({ where: { status: { in: ["IN_REVIEW", "APPROVED"] } } }),
    db.audioAsset.groupBy({ by: ["qaStatus"], _count: true }),
    db.audioAsset.count({ where: { humanVerdict: { not: null } } }),
    db.systemEvent.findMany({ where: { level: "error", createdAt: { gte: weekAgo } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.contentImport.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);
  const lessons = lessonsByStatus.reduce((n, r) => n + r._count, 0);
  const published = lessonsByStatus.find((r) => r.status === "PUBLISHED")?._count ?? 0;
  const reviewed = linguistic.filter((r) => r.linguisticStatus === "NATIVE_REVIEWED" || r.linguisticStatus === "APPROVED").reduce((n, r) => n + r._count, 0);
  const audioTotal = audioQa.reduce((n, r) => n + r._count, 0);
  const audioCount = (s: string) => audioQa.find((r) => r.qaStatus === s)?._count ?? 0;

  return (
    <>
      <PageHeader eyebrow="Admin" title="Overview" description="Content health, review progress and what is live in this deployment." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardBody><Stat icon={<Users className="h-4 w-4" />} label="Accounts" value={formatNumber(users)} hint={`${formatNumber(activeLearners)} active in the last 7 days`} /></CardBody></Card>
        <Card><CardBody><Stat icon={<GraduationCap className="h-4 w-4" />} label="Published lessons" value={`${formatNumber(published)} / ${formatNumber(lessons)}`} hint="Includes unit reviews and level exams" /></CardBody></Card>
        <Card><CardBody><Stat icon={<BookOpenText className="h-4 w-4" />} label="Linguistically reviewed" value={formatNumber(reviewed)} hint={`of ${formatNumber(lessons)} lessons · AI-drafted content stays unverified until reviewed`} /></CardBody></Card>
        <Card><CardBody><Stat icon={<ClipboardCheck className="h-4 w-4" />} label="Premium subscribers" value={formatNumber(premium)} hint="Active or trialing" /></CardBody></Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Services" description="What this deployment is actually using. Fallbacks are labelled for learners too." />
          <CardBody>
            <ul className="divide-y divide-line">
              {status.checks.map((c) => (
                <li key={c.name} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
                  <div className="w-48 shrink-0">
                    <p className="text-sm font-medium text-navy-900">{c.name}</p>
                    <StateDot state={c.state} />
                  </div>
                  <p className="text-sm text-muted">{c.detail}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Review work" action={<Link href="/admin/review" className="text-sm font-medium text-navy-700 hover:underline">Open queue</Link>} />
            <CardBody className="space-y-3 text-sm">
              <p><span className="font-semibold text-navy-900 tabular-nums">{pendingRevisions}</span> revisions waiting for approval or publishing</p>
              <p><span className="font-semibold text-navy-900 tabular-nums">{formatNumber(lessons - reviewed)}</span> lessons without a native-speaker review</p>
              {lastImport && (
                <p className="text-muted">
                  Last import {timeAgo(lastImport.startedAt)} · <span className={lastImport.status === "FAILED" ? "text-danger-700" : ""}>{lastImport.status.toLowerCase()}</span>
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Audio QA" action={<Link href="/admin/audio" className="text-sm font-medium text-navy-700 hover:underline">Review clips</Link>} />
            <CardBody className="text-sm">
              <div className="flex items-center gap-3">
                <AudioLines className="h-5 w-5 text-navy-700" aria-hidden />
                <p><span className="font-semibold text-navy-900 tabular-nums">{formatNumber(audioTotal)}</span> clips</p>
              </div>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                {(["PASS", "REVIEW", "FAIL", "UNCHECKED"] as const).map((s) => (
                  <div key={s} className="rounded-lg bg-canvas px-2 py-2">
                    <dt className="text-[0.68rem] font-medium tracking-wide text-muted uppercase">{s.toLowerCase()}</dt>
                    <dd className="text-base font-semibold text-navy-900 tabular-nums">{formatNumber(audioCount(s))}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted">{formatNumber(audioVerdicts)} clips have a human verdict. Automatic QA re-transcribes each clip with Whisper; it checks that the words are right, not how natural they sound.</p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent errors" description="Server errors from the last 7 days." action={<Link href="/admin/events" className="text-sm font-medium text-navy-700 hover:underline">All events</Link>} />
        <CardBody>
          {events.length === 0 ? (
            <p className="text-sm text-muted">No errors recorded in the last 7 days.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-words"><span className="font-medium text-navy-900">{e.source}</span> · {e.message}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
