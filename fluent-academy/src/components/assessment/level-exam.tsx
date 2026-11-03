"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Award, CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, ProgressBar } from "@/components/ui/primitives";
import { MeterList } from "@/components/charts/charts";
import { ExerciseCard, type ExerciseData, type ResponsePayload } from "@/components/learning/exercise";
import { api, ApiError } from "@/lib/api";
import { SKILL_NAMES } from "@/lib/skills";


interface ExamResult {
  score: number;
  passed: boolean;
  xp: number;
  nextLevel: string | null;
  bySkill: Record<string, { correct: number; total: number }>;
  byObjective: Record<string, { correct: number; total: number }>;
  items: { id: string; correct: boolean; status: string; expected: string | null; explanation: string }[];
}

export function LevelExam({ slug, title, language, level, exercises, canDo }: { slug: string; title: string; language: string; level: string; exercises: ExerciseData[]; canDo: string[] }) {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [pos, setPos] = useState(0);
  const [answers, setAnswers] = useState<Record<string, ResponsePayload>>({});
  const [result, setResult] = useState<ExamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [moving, setMoving] = useState(false);

  const finish = async (all: Record<string, ResponsePayload>) => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await api<ExamResult>(`/api/assessments/${slug}/submit`, { body: { answers: all } });
      setResult(r);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit the assessment.");
    } finally {
      setSubmitting(false);
    }
  };

  const moveUp = async () => {
    if (!result?.nextLevel) return;
    setMoving(true);
    try {
      await api("/api/enrollment", { body: { language, level: result.nextLevel, activate: true } });
      router.push("/learn");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That level isn't available yet.");
      setMoving(false);
    }
  };

  if (!started) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card px-8 py-10">
          <ClipboardCheck className="h-10 w-10 text-gold-600" />
          <h1 className="display mt-4 text-3xl">{title}</h1>
          <p className="mt-3 text-muted">{exercises.length} questions · about 40 minutes. You won&apos;t see whether answers are right until the end. You need 70% to confirm the level.</p>
          {canDo.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-navy-900">This assessment checks that you can:</p>
              <ul className="mt-2 space-y-1.5 text-sm text-ink">
                {canDo.map((c) => <li key={c} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-navy-300" />{c}</li>)}
              </ul>
            </div>
          )}
          <Button size="lg" className="mt-8" onClick={() => setStarted(true)}>Begin assessment <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  if (result) {
    const pct = Math.round(result.score * 100);
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="card overflow-hidden text-center">
          <div className={result.passed ? "bg-navy-900 px-8 py-10 text-white" : "bg-canvas px-8 py-10"}>
            {result.passed ? <Award className="mx-auto h-10 w-10 text-gold-400" /> : <ClipboardCheck className="mx-auto h-10 w-10 text-navy-700" />}
            <p className={result.passed ? "mt-3 text-5xl font-semibold" : "mt-3 text-5xl font-semibold text-navy-900"}>{pct}%</p>
            <p className={result.passed ? "mt-2 text-navy-200" : "mt-2 text-muted"}>
              {result.passed ? `Level ${level} confirmed. ${result.xp ? `+${result.xp} XP.` : ""}` : `You need 70% to confirm ${level}. Review the weaker areas below and try again.`}
            </p>
            <p className={result.passed ? "mt-1 text-xs text-navy-300" : "mt-1 text-xs text-subtle"}>Mapped to CEFR {level} descriptors. This is not an official certificate.</p>
          </div>
          {result.passed && result.nextLevel && (
            <div className="flex justify-center gap-3 border-t border-line px-6 py-5">
              <Button size="lg" onClick={moveUp} loading={moving}>Move up to {result.nextLevel} <ArrowRight className="h-4 w-4" /></Button>
              <ButtonLink href="/learn" variant="outline" size="lg">Stay at {level}</ButtonLink>
            </div>
          )}
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card p-6">
            <h2 className="font-semibold text-navy-900">By skill</h2>
            <div className="mt-4">
              <MeterList data={Object.entries(result.bySkill).map(([s, v]) => ({ label: SKILL_NAMES[s] ?? s, value: v.correct / v.total, detail: `${v.correct}/${v.total}` }))} />
            </div>
          </div>
          <div className="card p-6">
            <h2 className="font-semibold text-navy-900">By objective</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {Object.entries(result.byObjective).map(([o, v]) => (
                <li key={o} className="flex items-start justify-between gap-3">
                  <span className="text-ink">{o}</span>
                  <span className={v.correct / v.total >= 0.7 ? "shrink-0 font-medium text-success-700" : "shrink-0 font-medium text-danger-700"}>{v.correct}/{v.total}</span>
                </li>
              ))}
              {Object.keys(result.byObjective).length === 0 && <li className="text-muted">Items are not mapped to objectives.</li>}
            </ul>
          </div>
        </div>
        <div className="card p-6">
          <h2 className="font-semibold text-navy-900">Answers</h2>
          <ol className="mt-4 space-y-3">
            {result.items.map((it, i) => (
              <li key={it.id} className="flex gap-3 text-sm">
                {it.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" />}
                <div>
                  <p className="font-medium text-navy-900">Question {i + 1}{!it.correct && it.expected ? <> — <span className="font-normal text-success-700" lang={language}>{it.expected}</span></> : null}</p>
                  <p className="text-muted">{it.explanation}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  const ex = exercises[pos];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-4">
        <ProgressBar value={Object.keys(answers).length} max={exercises.length} tone="gold" label="Assessment progress" />
        <span className="shrink-0 text-xs text-muted tabular-nums">{pos + 1}/{exercises.length}</span>
      </div>
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {ex && (
        <ExerciseCard
          key={ex.id}
          exercise={ex}
          language={language}
          speech={{ mode: "none", provider: "none", pronunciation: false, simulated: false }}
          exam
          index={pos}
          total={exercises.length}
          onSubmit={async (r) => {
            const all = { ...answers, [ex.id]: r };
            setAnswers(all);
            if (pos + 1 >= exercises.length) await finish(all);
            return null;
          }}
          onContinue={() => setPos((p) => Math.min(p + 1, exercises.length - 1))}
        />
      )}
      {submitting && <p className="mt-4 text-center text-sm text-muted">Scoring your assessment…</p>}
    </div>
  );
}
