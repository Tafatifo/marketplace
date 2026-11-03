"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, ProgressBar } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { LEVEL_INFO } from "@/lib/languages";
import { ExerciseCard, type ExerciseData, type ResponsePayload } from "@/components/learning/exercise";

interface PlacementItem extends ExerciseData {
  level: string;
}

interface ScoreResult {
  levels: { level: string; correct: number; total: number; passed: boolean }[];
  nextLevel: string | null;
  recommended: string;
  complete: boolean;
}

export function PlacementTest({ language, languageName, items, currentLevel }: { language: string; languageName: string; items: PlacementItem[]; currentLevel: string }) {
  const router = useRouter();
  const levels = useMemo(() => [...new Set(items.map((i) => i.level))], [items]);
  const [started, setStarted] = useState(false);
  const [level, setLevel] = useState(levels[0] ?? "A1");
  const [pos, setPos] = useState(0);
  const [answers, setAnswers] = useState<Record<string, ResponsePayload>>({});
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const block = items.filter((i) => i.level === level);
  const answeredCount = Object.keys(answers).length;

  const afterBlock = async (all: Record<string, ResponsePayload>) => {
    setError(null);
    try {
      const res = await api<ScoreResult>("/api/placement", { body: { language, answers: all, finish: false } });
      if (res.nextLevel) {
        setLevel(res.nextLevel);
        setPos(0);
        return;
      }
      const final = await api<ScoreResult>("/api/placement", { body: { language, answers: all, finish: true } });
      setResult(final);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't score your answers. Please try again.");
    }
  };

  const record = async (item: PlacementItem, r: ResponsePayload) => {
    const all = { ...answers, [item.key]: r };
    setAnswers(all);
    return { all };
  };

  const accept = async (lvl: string) => {
    setSaving(true);
    try {
      await api("/api/enrollment", { body: { language, level: lvl, activate: true } });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your level.");
      setSaving(false);
    }
  };

  if (!started) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy-900 text-gold-400"><Compass className="h-6 w-6" /></div>
        <h1 className="display mt-5 text-3xl">{languageName} placement check</h1>
        <p className="mt-3 text-muted">
          Questions start at A1 and get harder only while you keep doing well, so most people finish in under 10 minutes. You won&apos;t see right or wrong
          answers until the end — just answer as best you can, and guess rather than look things up.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" onClick={() => setStarted(true)}>Begin <ArrowRight className="h-4 w-4" /></Button>
          <Button size="lg" variant="ghost" onClick={() => router.push("/dashboard")}>Skip for now</Button>
        </div>
      </div>
    );
  }

  if (result) {
    const rec = result.recommended;
    return (
      <div className="mx-auto max-w-xl">
        <div className="card overflow-hidden">
          <div className="bg-navy-900 px-8 py-10 text-center text-white">
            <p className="eyebrow text-gold-400">Suggested starting level</p>
            <p className="mt-3 font-serif text-6xl font-semibold">{rec}</p>
            <p className="mt-2 text-navy-200">{LEVEL_INFO[rec]?.name} — {LEVEL_INFO[rec]?.selfDescription}</p>
          </div>
          <ul className="divide-y divide-line">
            {result.levels.map((l) => (
              <li key={l.level} className="flex items-center justify-between px-6 py-3 text-sm">
                <span className="font-medium text-navy-900">{l.level} questions</span>
                <span className="text-muted tabular-nums">{l.correct}/{l.total} {l.passed ? "· passed" : ""}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-3 px-6 py-6">
            <p className="text-xs text-muted">This is a short estimate, not a certification. You can change your level at any time from the Course page.</p>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="flex-1" onClick={() => accept(rec)} loading={saving}>Start at {rec}</Button>
              {rec !== currentLevel && (
                <Button size="lg" variant="outline" className="flex-1" onClick={() => accept(currentLevel)} disabled={saving}>Keep {currentLevel}</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const item = block[pos];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-4">
        <span className="shrink-0 rounded-full bg-navy-900 px-3 py-1 text-xs font-semibold text-white">{level}</span>
        <ProgressBar value={answeredCount} max={items.length} tone="gold" label="Placement progress" />
        <span className="shrink-0 text-xs text-muted tabular-nums">{pos + 1}/{block.length}</span>
      </div>
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {item && (
        <ExerciseCard
          key={item.key}
          exercise={item}
          language={language}
          speech={{ mode: "none", provider: "none", pronunciation: false, simulated: false }}
          exam
          index={pos}
          total={block.length}
          onSubmit={async (r) => {
            const { all } = await record(item, r);
            if (pos + 1 >= block.length) await afterBlock(all);
            return null;
          }}
          onContinue={() => setPos((p) => Math.min(p + 1, block.length - 1))}
        />
      )}
    </div>
  );
}
