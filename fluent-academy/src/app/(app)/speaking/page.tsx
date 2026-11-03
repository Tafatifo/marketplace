import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { TrendLine } from "@/components/charts/charts";
import { SpeakingPractice } from "@/components/speaking/speaking-practice";
import { db } from "@/server/db";
import { requireLearner } from "@/server/learner";
import { practiceSentences } from "@/server/speech/practice";
import { PROVIDER_LABEL, speechClientConfig } from "@/server/speech/config";
import { serializeAttempt } from "@/server/speech/service";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Speaking practice" };

export default async function SpeakingPage(props: PageProps<"/speaking">) {
  const ctx = await requireLearner("/speaking");
  const { focus } = await props.searchParams;
  const lang = ctx.enrollment.languageCode;
  const focusWord = typeof focus === "string" && focus.startsWith("pron.") ? focus.slice(5) : undefined;
  const [sentences, history, weakWords] = await Promise.all([
    practiceSentences(ctx.user.id, lang, ctx.enrollment.levelCode, focusWord),
    db.speakingAttempt.findMany({ where: { userId: ctx.user.id, languageCode: lang }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.learnerWeakness.findMany({ where: { userId: ctx.user.id, languageCode: lang, category: { startsWith: "pron." }, status: { in: ["ACTIVE", "EMERGING"] } }, orderBy: { score: "desc" }, take: 8 }),
  ]);
  const speech = speechClientConfig();
  const trend = history
    .filter((h) => h.matchScore !== null && h.context === "SENTENCE")
    .slice(0, 20)
    .reverse()
    .map((h) => ({ x: formatDate(h.createdAt, { day: "numeric", month: "short" }), y: h.matchScore!, detail: h.targetText ?? "" }));

  return (
    <>
      <PageHeader
        eyebrow="Practise"
        title="Speaking practice"
        description="Listen to a model, record yourself, and see which words were recognised. Replay your recording word by word."
      />
      <SpeakingPractice
        language={lang}
        sentences={sentences}
        speech={speech}
        history={history.map((h) => ({ ...serializeAttempt(h), targetText: h.targetText, createdAt: h.createdAt }))}
        focusLabel={focusWord ? `“${focusWord}”` : undefined}
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Recognition rate over time" description="Share of target words recognised in your last sentence recordings." />
          <CardBody>
            {trend.length >= 2 ? <TrendLine data={trend} title="Recognition rate" /> : <p className="text-sm text-muted">Record at least two sentences to see your trend.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Words to practise" description="Words that weren't recognised on several attempts." />
          <CardBody>
            {weakWords.length === 0 ? (
              <p className="text-sm text-muted">Nothing yet. Words that are repeatedly not recognised will appear here.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {weakWords.map((w) => (
                  <li key={w.id}>
                    <Link href={`/speaking?focus=${encodeURIComponent(w.category)}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-sm text-navy-900 hover:border-navy-200" lang={lang}>
                      {w.label.replace(/^Pronouncing /, "")} <span className="text-xs text-muted">×{w.errorCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardBody className="flex gap-4 text-sm">
          <ShieldCheck className="h-5 w-5 shrink-0 text-navy-700" />
          <div className="space-y-1.5 text-muted">
            <p className="font-medium text-navy-900">What this feedback measures</p>
            <p>
              Active engine: <span className="font-medium text-navy-900">{PROVIDER_LABEL[speech.provider] ?? speech.provider}</span>.{" "}
              {speech.pronunciation
                ? "A pronunciation-assessment service is connected, so recordings of target sentences also receive accuracy, fluency and completeness scores from it."
                : "No pronunciation-assessment service is connected. Feedback compares a speech-recognition transcript with the target sentence: it shows which words were understood (intelligibility), not a phonetic score. A correctly recognised word doesn't prove every sound was perfect, and a missed word can be caused by noise, the microphone or an accent the recogniser handles poorly."}
            </p>
            <p>Recordings are private. They are deleted after {ctx.prefs.retainRecordings ? `${ctx.prefs.recordingRetentionDays} days` : "analysis (you've turned storage off)"} — change this in <Link href="/settings#privacy" className="font-medium text-navy-800 underline">Settings</Link>.</p>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
