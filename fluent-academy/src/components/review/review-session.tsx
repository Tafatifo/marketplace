"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, Check, CheckCircle2, Headphones, PartyPopper, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Badge, ProgressBar } from "@/components/ui/primitives";
import { AudioButton } from "@/components/learning/audio";
import { ExerciseCard, type AttemptOutcome, type ExerciseData } from "@/components/learning/exercise";
import type { SpeechConfig } from "@/components/learning/recorder";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

export interface VocabCard {
  id: string;
  mode: "PRODUCTION" | "RECALL" | "LISTENING" | "CONTEXT";
  prompt: { show: string; ask: string; hint?: string; audioKey?: string | null };
}

type Item = { kind: "vocab"; card: VocabCard } | { kind: "exercise"; exercise: ExerciseData };

interface VocabResult {
  correct: boolean;
  level: string;
  expected: string;
  term: string;
  translation: string;
  example: string | null;
  intervalDays: number;
}

const MODE_LABEL = { PRODUCTION: "Recall the word", RECALL: "What does it mean?", LISTENING: "Listen and write", CONTEXT: "Complete the sentence" };

function Flashcard({ card, language, onDone }: { card: VocabCard; language: string; onDone: (correct: boolean) => void }) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<VocabResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const submit = async (selfGrade?: 3 | 4 | 5) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<VocabResult>(`/api/vocabulary/${card.id}/review`, { body: { mode: card.mode, response: answer, selfGrade } });
      setResult(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save this review.");
    } finally {
      setBusy(false);
    }
  };
  const lang = card.mode === "RECALL" ? "en" : language;
  return (
    <div className="card px-6 py-8 sm:px-10">
      <div className="mb-6 flex items-center justify-between">
        <Badge tone="gold">Vocabulary · {MODE_LABEL[card.mode]}</Badge>
      </div>
      <div className="text-center">
        {card.mode === "LISTENING" ? (
          <div className="flex flex-col items-center gap-3">
            <AudioButton audio={card.prompt.audioKey ? { key: card.prompt.audioKey } : null} size="lg" variant="solid" showSlow={false} lang={language} />
            <p className="flex items-center gap-1.5 text-sm text-muted"><Headphones className="h-4 w-4" /> {card.prompt.ask}</p>
          </div>
        ) : (
          <>
            <p className={cn("font-serif text-3xl text-navy-900", card.mode === "CONTEXT" && "text-2xl")} lang={card.mode === "PRODUCTION" ? "en" : language}>{card.prompt.show}</p>
            {card.prompt.hint && <p className="mt-2 text-sm text-muted">{card.prompt.hint}</p>}
            <p className="mt-3 text-sm text-muted">{card.prompt.ask}</p>
          </>
        )}
      </div>
      {!result ? (
        <form
          className="mx-auto mt-8 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={`card-${card.id}`} className="sr-only">Your answer</label>
          <input
            id={`card-${card.id}`}
            ref={inputRef}
            autoFocus
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            lang={lang}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-12 w-full rounded-xl border border-line px-4 text-center text-lg focus:border-navy-400 focus:ring-4 focus:ring-navy-100 focus:outline-none"
            placeholder="Type your answer"
          />
          {error && <p className="mt-2 text-sm text-danger-600">{error}</p>}
          <div className="mt-4 flex justify-center gap-2">
            <Button type="button" variant="ghost" onClick={() => submit()} disabled={busy}>I don&apos;t know</Button>
            <Button type="submit" disabled={!answer.trim()} loading={busy}>Check</Button>
          </div>
        </form>
      ) : (
        <div className="mx-auto mt-8 max-w-md text-center animate-rise">
          <div className={cn("rounded-xl px-5 py-4", result.correct ? "bg-success-50" : "bg-danger-50")}>
            <p className={cn("flex items-center justify-center gap-1.5 font-semibold", result.correct ? "text-success-700" : "text-danger-700")}>
              {result.correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              {result.correct ? (result.level === "exact" ? "Correct" : "Correct — check the spelling") : "Not this time"}
            </p>
            <p className="mt-2 text-lg font-medium text-navy-900" lang={language}>{result.term} <span className="text-base font-normal text-muted">— {result.translation}</span></p>
            {result.example && <p className="mt-1 text-sm text-muted italic" lang={language}>{result.example}</p>}
            <p className="mt-2 text-xs text-muted">{result.correct ? `Next review in ${result.intervalDays} day${result.intervalDays === 1 ? "" : "s"}.` : "You'll see this again in a few minutes."}</p>
          </div>
          <Button size="lg" className="mt-5" autoFocus onClick={() => onDone(result.correct)}>Continue <ArrowRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}

export function ReviewSession({
  items: initial,
  language,
  speech,
  title,
}: {
  items: Item[];
  language: string;
  speech: SpeechConfig;
  title: string;
}) {
  const router = useRouter();
  const [items] = useState(initial);
  const [pos, setPos] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [started, setStarted] = useState(false);
  const item = items[pos];
  const next = (ok: boolean) => {
    if (ok) setCorrect((c) => c + 1);
    setPos((p) => p + 1);
    if (pos + 1 >= items.length) router.refresh();
  };

  if (!items.length) {
    return (
      <div className="card px-8 py-12 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success-600" />
        <h2 className="mt-4 font-serif text-2xl text-navy-900">Nothing due right now</h2>
        <p className="mx-auto mt-2 max-w-md text-muted">Words and missed exercises come back here when they&apos;re due. Save words from lessons and readings to build your deck.</p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/learn">Continue the course</ButtonLink>
          <ButtonLink href="/vocabulary" variant="outline">Open notebook</ButtonLink>
        </div>
      </div>
    );
  }
  if (!started) {
    const v = items.filter((i) => i.kind === "vocab").length;
    const e = items.length - v;
    return (
      <div className="card px-8 py-10 text-center">
        <h2 className="font-serif text-2xl text-navy-900">{title}</h2>
        <p className="mt-2 text-muted">{[v ? `${v} word${v === 1 ? "" : "s"}` : null, e ? `${e} exercise${e === 1 ? "" : "s"}` : null].filter(Boolean).join(" and ")} · about {Math.max(2, Math.round(items.length * 0.5))} minutes</p>
        <Button size="lg" className="mt-6" onClick={() => setStarted(true)}>Start review <ArrowRight className="h-4 w-4" /></Button>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="card px-8 py-12 text-center">
        <PartyPopper className="mx-auto h-10 w-10 text-gold-500" />
        <h2 className="mt-4 font-serif text-2xl text-navy-900">Review complete</h2>
        <p className="mt-2 text-muted">{correct} of {items.length} correct. Items you missed will come back soon.</p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
          <Link href="/review" className="inline-flex h-10 items-center px-4 text-sm font-medium text-navy-700 hover:underline" onClick={() => router.refresh()}>Check for more</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-4">
        <ProgressBar value={pos} max={items.length} tone="gold" label="Review progress" />
        <span className="shrink-0 text-xs text-muted tabular-nums">{pos + 1}/{items.length}</span>
      </div>
      {item.kind === "vocab" ? (
        <Flashcard key={item.card.id + pos} card={item.card} language={language} onDone={next} />
      ) : (
        <ReviewExercise key={item.exercise.id + pos} exercise={item.exercise} language={language} speech={speech} onDone={next} />
      )}
    </div>
  );
}

function ReviewExercise({ exercise, language, speech, onDone }: { exercise: ExerciseData; language: string; speech: SpeechConfig; onDone: (ok: boolean) => void }) {
  const [last, setLast] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      {err && <Alert tone="danger" className="mb-3">{err}</Alert>}
      <ExerciseCard
        exercise={exercise}
        language={language}
        speech={speech}
        onSubmit={async (r) => {
          try {
            const out = await api<AttemptOutcome>(`/api/exercises/${exercise.id}/attempt`, { body: { response: r, mode: "review" } });
            setLast(out.result.correct);
            return out;
          } catch (e) {
            setErr(e instanceof ApiError ? e.message : "Couldn't check this answer.");
            throw e;
          }
        }}
        onContinue={() => onDone(last)}
      />
    </>
  );
}
