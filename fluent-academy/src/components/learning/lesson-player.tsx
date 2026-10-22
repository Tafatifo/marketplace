"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Award, BookOpen, CheckCircle2, Dumbbell, RotateCcw, Sparkles, Target, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Badge, ProgressBar } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { LessonContent } from "@/content/types";
import { LessonBlockView } from "./blocks";
import { ExerciseCard, type AttemptOutcome, type ExerciseData, type ResponsePayload } from "./exercise";
import type { SpeechConfig } from "./recorder";

export interface PlayerLesson {
  id: string;
  slug: string;
  title: string;
  summary: string;
  kind: string;
  minutes: number;
  objectives: string[];
  content: LessonContent;
  language: string;
  level: string;
  unit: { slug: string; title: string; order: number };
  linguisticStatus: string;
}

interface CompletionSummary {
  score: number;
  passed: boolean;
  xp: number;
  firstCompletion: boolean;
  achievements: string[];
  correct: number;
  total: number;
}

const BLOCK_LABEL: Record<string, string> = {
  intro: "Overview",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  dialogue: "Dialogue",
  reading: "Reading",
  pronunciation: "Pronunciation",
  culture: "Culture",
  mistakes: "Common mistakes",
  task: "Task",
  summary: "Summary",
  cando: "Self-check",
};

export function LessonPlayer({
  lesson,
  exercises,
  speech,
  savedTerms,
  completed,
  bestScore,
  nextLesson,
}: {
  lesson: PlayerLesson;
  exercises: ExerciseData[];
  speech: SpeechConfig;
  savedTerms: string[];
  completed: boolean;
  bestScore: number;
  nextLesson: { slug: string; title: string } | null;
}) {
  const router = useRouter();
  const blocks = lesson.content.blocks;
  const saved = useMemo(() => new Set(savedTerms.map((t) => t.toLowerCase())), [savedTerms]);
  const [phase, setPhase] = useState<"learn" | "practice" | "summary">("learn");
  const [step, setStep] = useState(0);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [queue, setQueue] = useState<ExerciseData[]>(exercises);
  const [position, setPosition] = useState(0);
  const [wrong, setWrong] = useState<ExerciseData[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<{ message: string; upgrade?: boolean } | null>(null);
  const [summary, setSummary] = useState<CompletionSummary | null>(null);
  const [answered, setAnswered] = useState(0);

  const startPractice = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await api<{ sessionKey: string }>(`/api/lessons/${lesson.slug}/start`, { method: "POST" });
      setSessionKey(res.sessionKey);
      setQueue(exercises);
      setPosition(0);
      setWrong([]);
      setRetrying(false);
      setAnswered(0);
      setPhase("practice");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, upgrade: err.status === 402 });
      else setError({ message: "We couldn't start the practice session. Please try again." });
    } finally {
      setStarting(false);
    }
  };

  const submit = async (exercise: ExerciseData, response: ResponsePayload): Promise<AttemptOutcome> => {
    const out = await api<AttemptOutcome>(`/api/exercises/${exercise.id}/attempt`, {
      body: { response, sessionKey, mode: "lesson" },
    });
    if (!retrying) {
      setAnswered((n) => n + 1);
      if (!out.result.correct && out.result.status !== "skipped" && exercise.type !== "SPEAKING" && exercise.type !== "WRITING") {
        setWrong((w) => [...w, exercise]);
      }
    }
    return out;
  };

  const finish = async () => {
    if (!sessionKey) return;
    setFinishing(true);
    setError(null);
    try {
      const res = await api<CompletionSummary>(`/api/lessons/${lesson.slug}/complete`, { body: { sessionKey } });
      setSummary(res);
      setPhase("summary");
      router.refresh();
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "We couldn't save your results. Please try again." });
    } finally {
      setFinishing(false);
    }
  };

  const next = () => {
    if (position + 1 < queue.length) {
      setPosition((p) => p + 1);
      return;
    }
    // Second chance on up to three missed items (practice only; the score uses first attempts).
    if (!retrying && wrong.length > 0) {
      setRetrying(true);
      setQueue(wrong.slice(0, 3));
      setPosition(0);
      return;
    }
    void finish();
  };

  const header = (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <Link href="/learn" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-navy-900">
          <ArrowLeft className="h-4 w-4" /> Unit {lesson.unit.order < 99 ? lesson.unit.order : ""} · {lesson.unit.title}
        </Link>
        <h1 className="display mt-2 text-3xl">{lesson.title}</h1>
        <p className="mt-1 max-w-2xl text-muted">{lesson.summary}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline">{lesson.level}</Badge>
        <Badge tone="outline">~{lesson.minutes} min</Badge>
        {completed && <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Completed · best {Math.round(bestScore * 100)}%</Badge>}
      </div>
    </div>
  );

  if (phase === "summary" && summary) {
    const pct = Math.round(summary.score * 100);
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card overflow-hidden text-center">
          <div className={cn("px-8 py-10", summary.passed ? "bg-navy-900 text-white" : "bg-canvas")}>
            {summary.passed ? <Award className="mx-auto h-10 w-10 text-gold-400" /> : <Target className="mx-auto h-10 w-10 text-navy-700" />}
            <h1 className={cn("mt-4 font-serif text-3xl font-semibold", summary.passed ? "text-white" : "text-navy-900")}>
              {summary.passed ? (summary.firstCompletion ? "Lesson complete" : "Practice complete") : "Almost there"}
            </h1>
            <p className={cn("mt-2", summary.passed ? "text-navy-200" : "text-muted")}>
              {summary.passed
                ? `You answered ${summary.correct} of ${summary.total} correctly on the first try.`
                : `You scored ${pct}%. Reach 60% on first attempts to complete the lesson — review the explanations and try again.`}
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
            <div className="px-4 py-5"><p className="text-2xl font-semibold text-navy-900 tabular-nums">{pct}%</p><p className="text-xs text-muted">First-try score</p></div>
            <div className="px-4 py-5"><p className="text-2xl font-semibold text-navy-900 tabular-nums">+{summary.xp}</p><p className="text-xs text-muted">XP earned</p></div>
            <div className="px-4 py-5"><p className="text-2xl font-semibold text-navy-900 tabular-nums">{wrong.length}</p><p className="text-xs text-muted">Added to review</p></div>
          </div>
          {summary.achievements.length > 0 && (
            <div className="flex items-center justify-center gap-2 border-b border-line bg-gold-50 px-6 py-3 text-sm text-gold-700">
              <Sparkles className="h-4 w-4" /> New achievement{summary.achievements.length > 1 ? "s" : ""} unlocked — see your achievements page.
            </div>
          )}
          <div className="flex flex-col gap-3 px-6 py-6 sm:flex-row sm:justify-center">
            {summary.passed && nextLesson ? (
              <ButtonLink href={`/learn/${nextLesson.slug}`} size="lg">Next: {nextLesson.title} <ArrowRight className="h-4 w-4" /></ButtonLink>
            ) : summary.passed ? (
              <ButtonLink href="/learn" size="lg">Back to course <ArrowRight className="h-4 w-4" /></ButtonLink>
            ) : null}
            <Button variant="outline" size="lg" onClick={() => { setPhase("learn"); setStep(0); }}>
              <RotateCcw className="h-4 w-4" /> {summary.passed ? "Review the lesson" : "Study and retry"}
            </Button>
            {wrong.length > 0 && <ButtonLink href="/review" variant="secondary" size="lg"><Dumbbell className="h-4 w-4" /> Review mistakes</ButtonLink>}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "practice") {
    const ex = queue[position];
    const progress = retrying ? 100 : (answered / Math.max(1, exercises.length)) * 100;
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center gap-4">
          <button type="button" onClick={() => setPhase("learn")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-navy-900" aria-label="Leave practice and return to the lesson">
            <X className="h-5 w-5" />
          </button>
          <ProgressBar value={progress} label="Practice progress" tone="gold" />
          <span className="shrink-0 text-xs font-medium text-muted tabular-nums">{Math.min(answered, exercises.length)}/{exercises.length}</span>
        </div>
        {retrying && (
          <Alert tone="info" className="mb-4" icon={<RotateCcw className="h-4 w-4" />}>
            Second chance: let&apos;s revisit a few items you missed. These don&apos;t change your score.
          </Alert>
        )}
        {error && <Alert tone="danger" className="mb-4">{error.message}</Alert>}
        {ex && (
          <ExerciseCard
            key={`${retrying ? "r" : "p"}-${ex.id}-${position}`}
            exercise={ex}
            language={lesson.language}
            speech={speech}
            onSubmit={(r) => submit(ex, r)}
            onContinue={next}
            index={position}
            total={queue.length}
          />
        )}
        {finishing && <p className="mt-4 text-center text-sm text-muted">Saving your results…</p>}
      </div>
    );
  }

  // Learn phase
  const block = blocks[step];
  return (
    <div>
      {header}
      {lesson.linguisticStatus === "AI_DRAFTED" && (
        <p className="mb-5 text-xs text-subtle">This lesson was drafted with AI assistance and is awaiting review by a language specialist.</p>
      )}
      <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Lesson sections" className="hidden lg:block">
          <ol className="sticky top-8 space-y-1">
            {blocks.map((b, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors", i === step ? "bg-white font-semibold text-navy-900 shadow-sm ring-1 ring-line" : "text-muted hover:text-navy-900")}
                >
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold", i < step ? "bg-navy-800 text-white" : i === step ? "bg-gold-500 text-navy-950" : "bg-navy-100 text-navy-700")}>
                    {i < step ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                  </span>
                  {BLOCK_LABEL[b.type] ?? b.type}
                </button>
              </li>
            ))}
            <li className="pt-2">
              <button type="button" onClick={startPractice} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-navy-800 hover:bg-white">
                <Dumbbell className="h-4 w-4" /> Practice ({exercises.length})
              </button>
            </li>
          </ol>
        </nav>
        <div className="min-w-0">
          {step === 0 && lesson.objectives.length > 0 && (
            <div className="mb-5 rounded-[var(--radius-card)] border border-line bg-white px-5 py-4">
              <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase"><BookOpen className="h-3.5 w-3.5" /> In this lesson you will</p>
              <ul className="mt-2 grid gap-1.5 text-sm text-ink sm:grid-cols-2">
                {lesson.objectives.map((o) => <li key={o} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />{o}</li>)}
              </ul>
            </div>
          )}
          {block && (
            <div key={step} className="animate-rise">
              <LessonBlockView block={block} language={lesson.language} lessonId={lesson.id} savedTerms={saved} />
            </div>
          )}
          {error && (
            <Alert tone={error.upgrade ? "warning" : "danger"} className="mt-4">
              {error.message} {error.upgrade && <Link href="/billing" className="font-semibold underline">See Premium</Link>}
            </Alert>
          )}
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex gap-2">
              {step < blocks.length - 1 && (
                <Button variant="outline" onClick={startPractice} loading={starting} className="hidden sm:inline-flex">
                  Skip to practice
                </Button>
              )}
              {step < blocks.length - 1 ? (
                <Button size="lg" onClick={() => { setStep((s) => s + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="lg" onClick={startPractice} loading={starting}>
                  Start practice <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
