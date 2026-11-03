import Link from "next/link";
import { AudioReviewRow } from "@/components/admin/forms";
import { QaBadge } from "@/components/admin/badges";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { requireStaff } from "@/server/auth/current";
import { db } from "@/server/db";

const FILTERS = ["FAIL", "REVIEW", "PASS", "UNCHECKED"] as const;

export default async function AudioQaPage(props: PageProps<"/admin/audio">) {
  const user = await requireStaff();
  const sp = await props.searchParams;
  const status = FILTERS.find((f) => f === sp.status) ?? "FAIL";
  const lang = typeof sp.lang === "string" ? sp.lang : undefined;
  const where = { qaStatus: status, ...(lang ? { languageCode: lang } : {}) };
  const [counts, clips, total] = await Promise.all([
    db.audioAsset.groupBy({ by: ["qaStatus"], _count: true }),
    db.audioAsset.findMany({ where, orderBy: [{ humanVerdict: { sort: "asc", nulls: "first" } }, { qaScore: "asc" }], take: 60 }),
    db.audioAsset.count({ where }),
  ]);
  const count = (s: string) => counts.find((c) => c.qaStatus === s)?._count ?? 0;
  const canReview = user.role === "ADMIN" || user.role === "REVIEWER";
  return (
    <>
      <PageHeader
        eyebrow="Content pipeline"
        title="Audio QA"
        description="Every clip is synthesised from its script, then transcribed again with Whisper and compared with the script (plus a phoneme comparison for homophones). Low scores usually mean names, numbers or isolated words — listen and decide."
      />
      <div className="mb-5 flex flex-wrap gap-2" role="tablist">
        {FILTERS.map((f) => (
          <Link key={f} href={`/admin/audio?status=${f}${lang ? `&lang=${lang}` : ""}`} role="tab" aria-selected={f === status}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium", f === status ? "bg-navy-900 text-white" : "bg-white ring-1 ring-line")}>
            {f.charAt(0) + f.slice(1).toLowerCase()} <span className="tabular-nums opacity-70">{formatNumber(count(f))}</span>
          </Link>
        ))}
      </div>
      {clips.length === 0 ? (
        <EmptyState title="No clips in this group" />
      ) : (
        <Card>
          <p className="border-b border-line px-5 py-3 text-sm text-muted">{formatNumber(total)} clips{total > clips.length && ` · showing ${clips.length}, unreviewed and lowest scores first`}</p>
          <ul className="divide-y divide-line">
            {clips.map((c) => (
              <li key={c.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <QaBadge status={c.qaStatus} verdict={c.humanVerdict} />
                  {c.qaScore !== null && <span className="text-xs text-muted tabular-nums">score {c.qaScore.toFixed(2)}</span>}
                  <span className="text-xs text-muted">{c.voice} · {c.speed} · {(c.durationMs / 1000).toFixed(1)} s</span>
                  <code className="ml-auto text-[0.7rem] text-subtle">{c.key}</code>
                </div>
                <p className="text-sm whitespace-pre-line text-ink" lang={c.languageCode}><span className="text-muted">Script: </span>{c.text.replace(/^[fm]:/gm, "")}</p>
                {c.qaTranscript && <p className="text-sm text-muted" lang={c.languageCode}>Heard: {c.qaTranscript}</p>}
                {canReview && <AudioReviewRow id={c.id} audioKey={c.key} verdict={c.humanVerdict} note={c.humanNote} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
