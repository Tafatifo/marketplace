import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { ReviewSession } from "@/components/review/review-session";
import { db } from "@/server/db";
import { requireLearner } from "@/server/learner";
import { reviewQueue } from "@/server/review";
import { speechClientConfig } from "@/server/speech/config";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage(props: PageProps<"/review">) {
  const ctx = await requireLearner("/review");
  const { focus } = await props.searchParams;
  const lang = ctx.enrollment.languageCode;
  const focusKey = typeof focus === "string" && focus.length < 120 ? focus : undefined;
  const [queue, weaknesses] = await Promise.all([
    reviewQueue(ctx.user.id, lang, focusKey),
    db.learnerWeakness.findMany({ where: { userId: ctx.user.id, languageCode: lang, status: "ACTIVE", NOT: { category: { startsWith: "pron." } } }, orderBy: { score: "desc" }, take: 6 }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Spaced review" title={focusKey ? queue.title : "Review"} description="Words and missed exercises return just before you're likely to forget them. Answers are checked on the server; you type, rather than just recognise." />
      <div className="grid gap-6 lg:grid-cols-[1fr_17rem]">
        <ReviewSession key={focusKey ?? "due"} items={queue.items} language={lang} speech={speechClientConfig()} title={queue.title} />
        <Card className="h-fit">
          <CardHeader title="Focus areas" description="Practise a recurring difficulty." />
          <CardBody>
            {weaknesses.length === 0 ? (
              <p className="text-sm text-muted">None yet. They appear after repeated errors on the same point.</p>
            ) : (
              <ul className="space-y-1.5">
                {focusKey && <li><Link href="/review" className="text-sm font-medium text-navy-700 hover:underline">← Back to today&apos;s review</Link></li>}
                {weaknesses.map((w) => (
                  <li key={w.id}>
                    <Link href={`/review?focus=${encodeURIComponent(w.category)}`} className={`block rounded-lg px-3 py-2 text-sm hover:bg-navy-50 ${focusKey === w.category ? "bg-navy-50 font-semibold text-navy-900" : "text-ink"}`}>
                      {w.label}
                      <span className="block text-xs text-muted">{w.errorCount} errors · {w.distinctItems} items</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
