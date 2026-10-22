"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check, CircleAlert, Headphones, Lightbulb, SkipForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { ExercisePrompt } from "@/content/types";
import type { ValidationResult } from "@/lib/validate";
import { AudioButton } from "./audio";
import { Recorder, type SpeakingAttemptResult, type SpeechConfig } from "./recorder";
import { WordFeedback } from "./word-feedback";

export interface ExerciseData {
  id: string;
  key: string;
  type: string;
  skill: string;
  prompt: ExercisePrompt;
}

export interface AttemptOutcome {
  result: ValidationResult;
  explanation: string;
  answerKey: Record<string, unknown> | undefined;
}

export type ResponsePayload =
  | { kind: "choice"; choice: number }
  | { kind: "blanks"; values: string[] }
  | { kind: "order"; tokens: string[] }
  | { kind: "match"; pairs: number[] }
  | { kind: "text"; text: string }
  | { kind: "speech"; attemptId: string }
  | { kind: "skip"; reason?: string };

const ACCENTS: Record<string, string[]> = {
  fr: ["é", "è", "ê", "ë", "à", "â", "ç", "î", "ï", "ô", "û", "ù", "œ"],
  es: ["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"],
  de: ["ä", "ö", "ü", "ß"],
  en: [],
};

const TYPE_LABEL: Record<string, string> = {
  MULTIPLE_CHOICE: "Choose the answer",
  FILL_BLANK: "Fill in the blank",
  SENTENCE_ORDER: "Build the sentence",
  MATCHING: "Match the pairs",
  TRANSLATION: "Translate",
  SHORT_ANSWER: "Short answer",
  LISTENING: "Listen",
  DICTATION: "Dictation",
  SPEAKING: "Speak",
  WRITING: "Write",
};

function AccentBar({ language, onInsert }: { language: string; onInsert: (c: string) => void }) {
  const chars = ACCENTS[language] ?? [];
  if (!chars.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1" aria-label="Insert special characters">
      {chars.map((c) => (
        <button
          key={c}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(c)}
          className="h-8 min-w-8 rounded-md border border-line bg-white px-2 text-sm text-navy-900 hover:bg-navy-50"
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function useInsertAt<T extends HTMLInputElement | HTMLTextAreaElement>(value: string, setValue: (v: string) => void) {
  const ref = useRef<T | null>(null);
  const insert = (c: string) => {
    const el = ref.current;
    if (!el) return setValue(value + c);
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    const next = value.slice(0, s) + c + value.slice(e);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + c.length, s + c.length);
    });
  };
  return { ref, insert };
}

// ─────────────────────────────────────────────────────────────────────────────

function Choices({
  options,
  value,
  onChange,
  disabled,
  correctIndex,
}: {
  options: string[];
  value: number | null;
  onChange: (i: number) => void;
  disabled: boolean;
  correctIndex?: number;
}) {
  return (
    <div role="radiogroup" className="grid gap-2.5">
      {options.map((o, i) => {
        const selected = value === i;
        const isCorrect = disabled && correctIndex === i;
        const isWrong = disabled && selected && correctIndex !== undefined && correctIndex !== i;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(i)}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left text-[0.95rem] transition-[border-color,box-shadow,background-color]",
              !disabled && (selected ? "border-navy-700 shadow-[0_0_0_3px_var(--color-navy-100)]" : "border-line hover:border-navy-200 hover:bg-navy-50/50"),
              isCorrect && "border-success-600 bg-success-50",
              isWrong && "border-danger-600 bg-danger-50",
              disabled && !isCorrect && !isWrong && "border-line opacity-70",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold",
                selected ? "border-navy-800 bg-navy-800 text-white" : "border-line text-muted",
                isCorrect && "border-success-600 bg-success-600 text-white",
                isWrong && "border-danger-600 bg-danger-600 text-white",
              )}
              aria-hidden
            >
              {isCorrect ? <Check className="h-3.5 w-3.5" /> : isWrong ? <X className="h-3.5 w-3.5" /> : String.fromCharCode(65 + i)}
            </span>
            <span className="text-ink">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

function FillInput({
  sentence,
  values,
  onChange,
  disabled,
  language,
  marks,
}: {
  sentence: string;
  values: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
  language: string;
  marks?: { correct: boolean; expected: string }[];
}) {
  const parts = sentence.split("___");
  const [focused, setFocused] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const insert = (c: string) => {
    const el = refs.current[focused];
    const v = values[focused] ?? "";
    const s = el?.selectionStart ?? v.length;
    const next = [...values];
    next[focused] = v.slice(0, s) + c + v.slice(el?.selectionEnd ?? s);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + 1, s + 1);
    });
  };
  return (
    <div>
      <p className="font-serif text-xl leading-[2.4] text-ink">
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 && (
              <span className="inline-flex flex-col align-baseline">
                <input
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  value={values[i] ?? ""}
                  onFocus={() => setFocused(i)}
                  onChange={(e) => {
                    const next = [...values];
                    next[i] = e.target.value;
                    onChange(next);
                  }}
                  disabled={disabled}
                  aria-label={`Blank ${i + 1}`}
                  autoCapitalize="off"
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(
                    "mx-1 inline-block w-32 rounded-md border-b-2 bg-navy-50/60 px-2 py-0.5 text-center font-sans text-base text-navy-900 focus:bg-white focus:outline-none",
                    marks?.[i] ? (marks[i]!.correct ? "border-success-600 bg-success-50" : "border-danger-600 bg-danger-50") : "border-navy-400 focus:border-navy-700",
                  )}
                  style={{ width: `${Math.max(6, (values[i]?.length ?? 0) + 2, (marks?.[i]?.expected.length ?? 0) + 2)}ch` }}
                />
                {marks?.[i] && !marks[i]!.correct && <span className="text-center font-sans text-xs leading-tight text-success-700">{marks[i]!.expected}</span>}
              </span>
            )}
          </span>
        ))}
      </p>
      {!disabled && <AccentBar language={language} onInsert={insert} />}
    </div>
  );
}

function OrderInput({
  tokens,
  prefix,
  suffix,
  value,
  onChange,
  disabled,
}: {
  tokens: string[];
  prefix?: string;
  suffix?: string;
  value: number[];
  onChange: (v: number[]) => void;
  disabled: boolean;
}) {
  const remaining = tokens.map((t, i) => ({ t, i })).filter(({ i }) => !value.includes(i));
  return (
    <div className="space-y-4">
      <div className="flex min-h-[3.75rem] flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-white px-3 py-3" aria-label="Your sentence" aria-live="polite">
        {prefix && <span className="text-lg text-muted">{prefix}</span>}
        {value.length === 0 && <span className="text-sm text-subtle">Tap the words below in the right order.</span>}
        {value.map((i, pos) => (
          <button
            key={`${i}-${pos}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value.filter((x) => x !== i))}
            className="rounded-lg bg-navy-900 px-3 py-1.5 text-[0.95rem] text-white shadow-sm transition-colors hover:bg-navy-800 disabled:hover:bg-navy-900"
            aria-label={`Remove ${tokens[i]}`}
          >
            {tokens[i]}
          </button>
        ))}
        {suffix && value.length > 0 && <span className="text-lg text-muted">{suffix}</span>}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Available words">
        {remaining.map(({ t, i }) => (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => onChange([...value, i])}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-[0.95rem] text-navy-900 shadow-sm transition-colors hover:border-navy-300 hover:bg-navy-50"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

const PAIR_COLORS = ["bg-navy-700", "bg-gold-600", "bg-success-600", "bg-navy-400", "bg-warning-600", "bg-danger-600", "bg-navy-950", "bg-gold-400"];

function MatchInput({
  left,
  right,
  pairs,
  onChange,
  disabled,
  correctPairs,
}: {
  left: string[];
  right: string[];
  pairs: number[];
  onChange: (p: number[]) => void;
  disabled: boolean;
  correctPairs?: boolean[];
}) {
  const [active, setActive] = useState<number | null>(0);
  const assign = (r: number) => {
    if (active === null) return;
    const next = pairs.map((p) => (p === r ? -1 : p));
    next[active] = r;
    onChange(next);
    const nextUnpaired = next.findIndex((p, i) => p === -1 && i !== active);
    setActive(nextUnpaired === -1 ? null : nextUnpaired);
  };
  const pairIndexOfRight = (r: number) => pairs.indexOf(r);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-6">
      <div className="space-y-2">
        {left.map((l, i) => {
          const paired = pairs[i] !== -1;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => setActive(i)}
              aria-pressed={active === i}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 text-left text-sm transition-colors",
                active === i && !disabled ? "border-navy-700 shadow-[0_0_0_3px_var(--color-navy-100)]" : "border-line",
                correctPairs && (correctPairs[i] ? "border-success-600 bg-success-50" : "border-danger-600 bg-danger-50"),
              )}
            >
              <span className="font-medium text-ink">{l}</span>
              {paired && <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold text-white", PAIR_COLORS[i % PAIR_COLORS.length])}>{i + 1}</span>}
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        {right.map((r, i) => {
          const owner = pairIndexOfRight(i);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled || active === null}
              onClick={() => assign(i)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 text-left text-sm transition-colors",
                owner !== -1 ? "border-navy-200 bg-navy-50/50" : "border-line hover:border-navy-200",
              )}
            >
              <span className="text-ink">{r}</span>
              {owner !== -1 && <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold text-white", PAIR_COLORS[owner % PAIR_COLORS.length])}>{owner + 1}</span>}
            </button>
          );
        })}
      </div>
      {!disabled && <p className="col-span-2 text-xs text-muted">Select an item on the left, then its match on the right.</p>}
    </div>
  );
}

function TextAnswer({
  value,
  onChange,
  disabled,
  language,
  multiline,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  language: string;
  multiline?: boolean;
  placeholder?: string;
  onSubmit: () => void;
}) {
  const input = useInsertAt<HTMLInputElement>(value, onChange);
  const area = useInsertAt<HTMLTextAreaElement>(value, onChange);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !multiline && value.trim()) {
      e.preventDefault();
      onSubmit();
    }
  };
  return (
    <div>
      {multiline ? (
        <textarea
          ref={area.ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          rows={6}
          lang={language}
          spellCheck={false}
          className="w-full rounded-xl border border-line bg-white px-4 py-3 text-[0.95rem] leading-relaxed text-ink focus:border-navy-400 focus:ring-4 focus:ring-navy-100 focus:outline-none disabled:bg-canvas"
          aria-label="Your answer"
        />
      ) : (
        <input
          ref={input.ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder={placeholder}
          lang={language}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="h-12 w-full rounded-xl border border-line bg-white px-4 text-[1rem] text-ink focus:border-navy-400 focus:ring-4 focus:ring-navy-100 focus:outline-none disabled:bg-canvas"
          aria-label="Your answer"
        />
      )}
      {!disabled && <AccentBar language={language} onInsert={multiline ? area.insert : input.insert} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FeedbackPanel({ outcome, exercise, language }: { outcome: AttemptOutcome; exercise: ExerciseData; language: string }) {
  const r = outcome.result;
  const tone =
    r.status === "correct" ? "success" : r.status === "almost" ? "gold" : r.status === "skipped" ? "neutral" : "danger";
  const styles = {
    success: "border-success-100 bg-success-50",
    gold: "border-gold-200 bg-gold-50",
    neutral: "border-line bg-canvas",
    danger: "border-danger-100 bg-danger-50",
  }[tone];
  const icon =
    r.status === "correct" ? <Check className="h-5 w-5 text-success-600" /> : r.status === "skipped" ? <SkipForward className="h-5 w-5 text-muted" /> : r.status === "almost" ? <CircleAlert className="h-5 w-5 text-gold-600" /> : <X className="h-5 w-5 text-danger-600" />;
  const key = outcome.answerKey ?? {};
  const shownExpected =
    r.status === "correct" || exercise.prompt.kind === "match" || exercise.prompt.kind === "mc" || exercise.prompt.kind === "listen" || exercise.prompt.kind === "fill"
      ? null
      : (r.expected ?? (key.accepted as string[] | undefined)?.[0] ?? (key.sentence as string | undefined) ?? (key.text as string | undefined) ?? null);
  return (
    <div className={cn("mt-5 rounded-xl border px-5 py-4 animate-rise", styles)} role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="mt-0.5">{icon}</span>
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <p className="font-semibold text-navy-900">{r.message}</p>
          {shownExpected && (
            <p className="text-ink">
              <span className="text-muted">{exercise.prompt.kind === "write" || exercise.prompt.kind === "speak" ? "Model answer: " : "Correct answer: "}</span>
              <span className="font-medium" lang={language}>{shownExpected}</span>
            </p>
          )}
          {r.alignment && exercise.prompt.kind === "dictation" && <WordFeedback alignment={r.alignment} className="rounded-lg bg-white/70 px-3 py-2" />}
          {typeof key.transcript === "string" && (
            <p className="text-ink">
              <span className="text-muted">Transcript: </span>
              <span lang={language}>{key.transcript}</span>
            </p>
          )}
          {r.missingRequirements && r.missingRequirements.length > 0 && (
            <p className="text-ink"><span className="text-muted">Still missing: </span>{r.missingRequirements.join(" · ")}</p>
          )}
          <p className="flex gap-2 leading-relaxed text-ink">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" aria-hidden />
            <span>{outcome.explanation}</span>
          </p>
          {r.notes.map((n) => (
            <p key={n} className="text-xs text-muted">{n}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ExerciseCard({
  exercise,
  language,
  speech,
  onSubmit,
  onContinue,
  exam = false,
  index,
  total,
}: {
  exercise: ExerciseData;
  language: string;
  speech: SpeechConfig;
  onSubmit: (response: ResponsePayload) => Promise<AttemptOutcome | null>;
  onContinue: () => void;
  exam?: boolean;
  index?: number;
  total?: number;
}) {
  const p = exercise.prompt;
  const [choice, setChoice] = useState<number | null>(null);
  const [blanks, setBlanks] = useState<string[]>(p.kind === "fill" ? Array(p.blanks).fill("") : []);
  const [order, setOrder] = useState<number[]>([]);
  const [pairs, setPairs] = useState<number[]>(p.kind === "match" ? Array(p.left.length).fill(-1) : []);
  const [text, setText] = useState("");
  const [speakAttempt, setSpeakAttempt] = useState<SpeakingAttemptResult | null>(null);
  const [outcome, setOutcome] = useState<AttemptOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (outcome) continueRef.current?.focus();
  }, [outcome]);

  const ready = useMemo(() => {
    switch (p.kind) {
      case "mc":
      case "listen":
        return choice !== null;
      case "fill":
        return blanks.every((b) => b.trim());
      case "order":
        return order.length === p.tokens.length;
      case "match":
        return pairs.every((x) => x !== -1);
      case "speak":
        return Boolean(speakAttempt);
      default:
        return text.trim().length > 0;
    }
  }, [p, choice, blanks, order, pairs, text, speakAttempt]);

  const payload = (): ResponsePayload => {
    switch (p.kind) {
      case "mc":
      case "listen":
        return { kind: "choice", choice: choice! };
      case "fill":
        return { kind: "blanks", values: blanks };
      case "order":
        return { kind: "order", tokens: order.map((i) => p.tokens[i]!) };
      case "match":
        return { kind: "match", pairs };
      case "speak":
        return speakAttempt && speakAttempt.assessmentType !== "SELF_REVIEW" ? { kind: "speech", attemptId: speakAttempt.id } : { kind: "skip", reason: "no-recognition" };
      default:
        return { kind: "text", text };
    }
  };

  const submit = async (override?: ResponsePayload) => {
    if (submitting || outcome) return;
    setSubmitting(true);
    setError(null);
    try {
      const out = await onSubmit(override ?? payload());
      if (exam) onContinue();
      else setOutcome(out);
    } catch (err) {
      setError((err as Error).message || "We couldn't check your answer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const done = Boolean(outcome);
  const correctIndex = outcome?.answerKey?.correctIndex as number | undefined;

  return (
    <div
      className="card px-5 py-6 sm:px-8 sm:py-8"
      onKeyDown={(e) => {
        if (e.key === "Enter" && done && !(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          onContinue();
        }
      }}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <Badge tone="navy">{TYPE_LABEL[exercise.type] ?? exercise.type}</Badge>
        {index !== undefined && total !== undefined && (
          <span className="text-xs font-medium text-muted tabular-nums">{index + 1} / {total}</span>
        )}
      </div>

      {/* Prompt */}
      <div className="mb-6 space-y-3">
        {p.kind === "mc" && (
          <>
            {p.context && (
              <details className="rounded-lg bg-canvas px-4 py-2.5 text-sm">
                <summary className="cursor-pointer font-medium text-navy-800">Show the text</summary>
                <p className="mt-2 whitespace-pre-line text-ink" lang={language}>{p.context}</p>
              </details>
            )}
            <div className="flex items-start gap-3">
              {p.audio && <AudioButton audio={p.audio} lang={language} showSlow={false} />}
              <h2 className="text-lg font-semibold text-navy-900" lang={language}>{p.question}</h2>
            </div>
          </>
        )}
        {p.kind === "listen" && (
          <div className="flex items-center gap-4">
            <AudioButton audio={p.audio} lang={language} size="lg" variant="solid" label="Play the recording" />
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Headphones className="h-3.5 w-3.5" /> Listen, then answer</p>
              <h2 className="text-lg font-semibold text-navy-900">{p.question}</h2>
            </div>
          </div>
        )}
        {p.kind === "fill" && (
          <>
            <h2 className="text-sm font-medium text-muted">Complete the sentence{p.hint ? <> — <span className="text-navy-800">({p.hint})</span></> : null}</h2>
            {p.translation && <p className="text-sm text-muted">{p.translation}</p>}
          </>
        )}
        {p.kind === "order" && (
          <>
            <h2 className="text-sm font-medium text-muted">Put the words in order</h2>
            {p.translation && <p className="text-lg font-semibold text-navy-900">“{p.translation}”</p>}
          </>
        )}
        {p.kind === "match" && <h2 className="text-lg font-semibold text-navy-900">{p.instruction ?? "Match the pairs."}</h2>}
        {p.kind === "translate" && (
          <>
            <h2 className="text-sm font-medium text-muted">{p.instruction}</h2>
            <p className="font-serif text-xl text-navy-900" lang={p.from}>{p.source}</p>
          </>
        )}
        {p.kind === "short" && (
          <>
            {p.context && (
              <details className="rounded-lg bg-canvas px-4 py-2.5 text-sm" open>
                <summary className="cursor-pointer font-medium text-navy-800">Text</summary>
                <p className="mt-2 whitespace-pre-line text-ink" lang={language}>{p.context}</p>
              </details>
            )}
            <h2 className="text-lg font-semibold text-navy-900">{p.question}</h2>
            <p className="text-xs text-muted">You can answer in English or in the language you&apos;re learning.</p>
          </>
        )}
        {p.kind === "dictation" && (
          <div className="flex items-center gap-4">
            <AudioButton audio={p.audio} lang={language} size="lg" variant="solid" label="Play the sentence" />
            <div>
              <h2 className="text-lg font-semibold text-navy-900">Type what you hear</h2>
              <p className="text-sm text-muted">{p.words} words{p.hint ? ` · “${p.hint}”` : ""}</p>
            </div>
          </div>
        )}
        {p.kind === "speak" && (
          <>
            <h2 className="text-sm font-medium text-muted">{p.instruction}</h2>
            {p.text && (
              <div className="flex items-start gap-3">
                <AudioButton audio={p.audio} text={p.text} lang={language} />
                <div>
                  <p className="font-serif text-xl text-navy-900" lang={language}>{p.text}</p>
                  {p.translation && <p className="mt-1 text-sm text-muted">{p.translation}</p>}
                </div>
              </div>
            )}
          </>
        )}
        {p.kind === "write" && (
          <>
            <h2 className="text-lg font-semibold text-navy-900">{p.instruction}</h2>
            <p className="text-sm text-muted">
              At least {p.minWords} words{p.requirements.length ? <> · include: <span className="text-navy-800" lang={language}>{p.requirements.join(" · ")}</span></> : null}
            </p>
          </>
        )}
      </div>

      {/* Input */}
      {(p.kind === "mc" || p.kind === "listen") && <Choices options={p.options} value={choice} onChange={setChoice} disabled={done || submitting} correctIndex={correctIndex} />}
      {p.kind === "fill" && <FillInput sentence={p.sentence} values={blanks} onChange={setBlanks} disabled={done || submitting} language={language} marks={outcome?.result.blanks} />}
      {p.kind === "order" && <OrderInput tokens={p.tokens} prefix={p.prefix} suffix={p.suffix} value={order} onChange={setOrder} disabled={done || submitting} />}
      {p.kind === "match" && <MatchInput left={p.left} right={p.right} pairs={pairs} onChange={setPairs} disabled={done || submitting} correctPairs={outcome?.result.pairs} />}
      {(p.kind === "translate" || p.kind === "short" || p.kind === "dictation") && (
        <TextAnswer value={text} onChange={setText} disabled={done || submitting} language={p.kind === "translate" ? p.to : language} placeholder={p.kind === "dictation" ? "Type the sentence…" : "Type your answer…"} onSubmit={() => ready && submit()} />
      )}
      {p.kind === "write" && (
        <>
          <TextAnswer value={text} onChange={setText} disabled={done || submitting} language={language} multiline placeholder="Write your answer here…" onSubmit={() => {}} />
          <p className="mt-2 text-right text-xs text-muted tabular-nums">{text.trim() ? text.trim().split(/\s+/).length : 0} / {p.minWords} words</p>
        </>
      )}
      {p.kind === "speak" && (
        <div className="space-y-3">
          {!done && (
            <Recorder
              language={language}
              targetText={p.mode === "repeat" ? p.text : undefined}
              context="EXERCISE"
              sourceId={exercise.id}
              speech={speech}
              onResult={setSpeakAttempt}
            />
          )}
          {speakAttempt && (
            <div className="rounded-xl bg-canvas px-4 py-3">
              {speakAttempt.alignment ? (
                <WordFeedback alignment={speakAttempt.alignment} />
              ) : (
                <p className="text-sm text-ink">
                  <span className="text-muted">We heard: </span>
                  <span lang={language}>{speakAttempt.transcript || "—"}</span>
                </p>
              )}
              <p className="mt-2 text-xs text-muted">
                {speakAttempt.providerLabel}
                {speakAttempt.isSimulated ? " · simulated for testing" : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-4 text-sm font-medium text-danger-600" role="alert">{error}</p>}
      {outcome && <FeedbackPanel outcome={outcome} exercise={exercise} language={language} />}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          {!done && p.kind === "speak" && (
            <Button variant="ghost" size="sm" onClick={() => submit({ kind: "skip", reason: "cannot-speak" })} disabled={submitting}>
              <SkipForward className="h-4 w-4" /> I can&apos;t speak right now
            </Button>
          )}
        </div>
        {done ? (
          <Button ref={continueRef} size="lg" onClick={onContinue}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="lg" onClick={() => submit()} disabled={!ready} loading={submitting}>
            {exam ? "Save and next" : p.kind === "speak" && speakAttempt?.assessmentType === "SELF_REVIEW" ? "Done — continue" : "Check"}
          </Button>
        )}
      </div>
    </div>
  );
}
