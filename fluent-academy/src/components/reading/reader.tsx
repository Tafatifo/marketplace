"use client";

import { useMemo, useState } from "react";
import { Popover } from "radix-ui";
import { BookmarkPlus, Check, ExternalLink, Eye, EyeOff, Gauge, Globe2, MessagesSquare, Send, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/primitives";
import { AudioButton, audioUrl } from "@/components/learning/audio";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { AudioRef, ExercisePrompt, Speaker } from "@/content/types";

interface Glossary {
  term: string;
  translation: string;
  note?: string;
}

export interface ReaderPassage {
  slug: string;
  title: string;
  summary: string;
  kind: "READING" | "LISTENING";
  language: string;
  level: string;
  body: string;
  translation: string | null;
  glossary: Glossary[];
  audio: AudioRef | null;
  speakers: Speaker[];
  lineAudio: AudioRef[];
  questions: { id: string; type: string; prompt: ExercisePrompt }[];
  wordCount: number;
  minutes: number;
}

const DICT: Record<string, string> = { fr: "fr", es: "es", de: "de", en: "en" };

function WordPopover({ word, language, glossary, passageSlug, sentence }: { word: string; language: string; glossary: Glossary[]; passageSlug: string; sentence: string }) {
  const clean = word.replace(/^[^\p{L}]+|[^\p{L}'-]+$/gu, "");
  const lower = clean.toLowerCase();
  const entry = glossary.find((g) => g.term.toLowerCase() === lower) ?? glossary.find((g) => g.term.toLowerCase().split(/[\s']/).includes(lower));
  const [translation, setTranslation] = useState(entry?.translation ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("/api/vocabulary", { body: { language, term: entry?.term ?? clean, translation: translation || "?", example: sentence.slice(0, 400), sourceType: "READING", sourceId: passageSlug, sourceContext: sentence.slice(0, 400) } });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };
  if (!clean) return <>{word}</>;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className={cn("rounded-sm decoration-navy-300 decoration-dotted underline-offset-4 hover:bg-gold-100 focus-visible:bg-gold-100", entry && "underline")}>{word}</button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} className="z-50 w-72 rounded-xl border border-line bg-white p-4 font-sans shadow-[var(--shadow-lift)]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <p className="font-serif text-lg font-semibold text-navy-900" lang={language}>{entry?.term ?? clean}</p>
          {entry ? (
            <>
              <p className="text-sm text-ink">{entry.translation}</p>
              {entry.note && <p className="mt-1 text-xs text-muted">{entry.note}</p>}
            </>
          ) : (
            <div className="mt-2">
              <label htmlFor={`tr-${clean}`} className="text-xs text-muted">Not in this text&apos;s glossary — add your own meaning:</label>
              <input id={`tr-${clean}`} value={translation} onChange={(e) => setTranslation(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line px-2.5 text-sm focus:border-navy-400 focus:outline-none" placeholder="Meaning" />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <a href={`https://${DICT[language] ?? "en"}.wiktionary.org/wiki/${encodeURIComponent(lower)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline">
              Dictionary <ExternalLink className="h-3 w-3" />
            </a>
            <Button size="sm" onClick={save} disabled={saved || (!entry && !translation.trim())} loading={busy}>
              {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : <><BookmarkPlus className="h-3.5 w-3.5" /> Save</>}
            </Button>
          </div>
          <Popover.Close className="absolute top-2 right-2 rounded p-1 text-subtle hover:text-navy-900" aria-label="Close"><X className="h-3.5 w-3.5" /></Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function InteractiveText({ text, language, glossary, slug }: { text: string; language: string; glossary: Glossary[]; slug: string }) {
  const paragraphs = text.split(/\n\s*\n/);
  return (
    <div className="reading-text space-y-5" lang={language}>
      {paragraphs.map((p, pi) => {
        const sentences = p.split(/(?<=[.!?…])\s+/);
        return (
          <p key={pi}>
            {sentences.map((s, si) => (
              <span key={si}>
                {s.split(/(\s+)/).map((tok, ti) => (/^\s+$/.test(tok) ? tok : <WordPopover key={ti} word={tok} language={language} glossary={glossary} passageSlug={slug} sentence={s} />))}{" "}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function ListeningPlayer({ passage }: { passage: ReaderPassage }) {
  const [rate, setRate] = useState(1);
  if (!passage.audio) return null;
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <audio
        controls
        src={audioUrl(passage.audio.key)}
        className="w-full"
        onPlay={(e) => {
          e.currentTarget.playbackRate = rate;
        }}
        onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
        aria-label={`Audio: ${passage.title}`}
      />
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <Gauge className="h-3.5 w-3.5" /> Speed:
        {[0.75, 0.9, 1].map((r) => (
          <button
            key={r}
            type="button"
            onClick={(e) => {
              setRate(r);
              const audio = (e.currentTarget.closest("div")?.parentElement?.querySelector("audio") as HTMLAudioElement | null);
              if (audio) audio.playbackRate = r;
            }}
            className={cn("rounded-full px-2.5 py-1 font-medium", rate === r ? "bg-navy-900 text-white" : "bg-navy-50 text-navy-800")}
          >
            {r}×
          </button>
        ))}
      </div>
    </div>
  );
}

type QuestionResult = { id: string; correct: boolean; message: string; expected: string | null; explanation: string };

function Questions({ passage, onDone }: { passage: ReaderPassage; onDone: (r: { score: number; passed: boolean; xp: number }) => void }) {
  const [answers, setAnswers] = useState<Record<string, { kind: "choice"; choice: number } | { kind: "text"; text: string }>>({});
  const [results, setResults] = useState<QuestionResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = passage.questions.every((q) => {
    const a = answers[q.id];
    return a && (a.kind === "choice" || a.text.trim());
  });
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ score: number; passed: boolean; xp: number; results: QuestionResult[] }>(`/api/passages/${passage.slug}/answers`, { body: { answers } });
      setResults(res.results);
      onDone(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't check your answers.");
    } finally {
      setBusy(false);
    }
  };
  const byId = new Map(results?.map((r) => [r.id, r]));
  return (
    <div className="space-y-5">
      {passage.questions.map((q, i) => {
        const r = byId.get(q.id);
        const p = q.prompt;
        return (
          <fieldset key={q.id} className={cn("rounded-xl border px-4 py-4", r ? (r.correct ? "border-success-100 bg-success-50/50" : "border-danger-100 bg-danger-50/50") : "border-line")}>
            <legend className="sr-only">Question {i + 1}</legend>
            <p className="font-medium text-navy-900">{i + 1}. {p.kind === "mc" || p.kind === "short" || p.kind === "listen" ? p.question : ""}</p>
            {(p.kind === "mc" || p.kind === "listen") && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {p.options.map((o, oi) => (
                  <label key={oi} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border bg-white px-3 py-2 text-sm", answers[q.id]?.kind === "choice" && (answers[q.id] as { choice: number }).choice === oi ? "border-navy-700" : "border-line")}>
                    <input type="radio" name={q.id} disabled={Boolean(results)} checked={answers[q.id]?.kind === "choice" && (answers[q.id] as { choice: number }).choice === oi} onChange={() => setAnswers({ ...answers, [q.id]: { kind: "choice", choice: oi } })} className="accent-navy-800" />
                    {o}
                  </label>
                ))}
              </div>
            )}
            {p.kind === "short" && (
              <input
                disabled={Boolean(results)}
                value={answers[q.id]?.kind === "text" ? (answers[q.id] as { text: string }).text : ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: { kind: "text", text: e.target.value } })}
                className="mt-3 h-10 w-full rounded-lg border border-line px-3 text-sm focus:border-navy-400 focus:outline-none"
                placeholder="Answer in English or in the language you're learning"
                aria-label={`Answer to question ${i + 1}`}
              />
            )}
            {r && (
              <div className="mt-3 text-sm">
                <p className={r.correct ? "font-medium text-success-700" : "font-medium text-danger-700"}>{r.correct ? "Correct" : `Not quite${r.expected ? ` — ${r.expected}` : ""}`}</p>
                <p className="mt-0.5 text-muted">{r.explanation}</p>
              </div>
            )}
          </fieldset>
        );
      })}
      {error && <Alert tone="danger">{error}</Alert>}
      {!results && <Button onClick={submit} disabled={!complete} loading={busy}>Check answers</Button>}
    </div>
  );
}

function SummaryBox({ passage }: { passage: ReaderPassage }) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<{ kind: string; coverage?: string; language?: string; improved?: string; note?: string; words: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ feedback: NonNullable<typeof feedback> }>(`/api/passages/${passage.slug}/summary`, { body: { text } });
      setFeedback(res.feedback);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your summary.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <label htmlFor="summary" className="text-sm text-muted">In 2–4 sentences, summarise the text in {passage.language === "en" ? "English" : "the language you're learning"}.</label>
      <textarea id="summary" value={text} onChange={(e) => setText(e.target.value)} rows={4} lang={passage.language} className="mt-2 w-full rounded-xl border border-line px-4 py-3 text-[0.95rem] focus:border-navy-400 focus:ring-4 focus:ring-navy-100 focus:outline-none" />
      {error && <Alert tone="danger" className="mt-2">{error}</Alert>}
      <div className="mt-2 flex justify-end"><Button onClick={submit} loading={busy} disabled={text.trim().split(/\s+/).length < 10}><Send className="h-4 w-4" /> Save summary</Button></div>
      {feedback && (
        <div className="mt-4 rounded-xl bg-canvas px-4 py-3 text-sm">
          {feedback.kind === "ai" ? (
            <div className="space-y-2">
              <p><span className="font-semibold text-navy-900">Content: </span>{feedback.coverage}</p>
              <p><span className="font-semibold text-navy-900">Language: </span>{feedback.language}</p>
              <p><span className="font-semibold text-navy-900">Improved version: </span><span lang={passage.language}>{feedback.improved}</span></p>
              <p className="text-xs text-subtle">AI-generated feedback — it may occasionally be wrong.</p>
            </div>
          ) : (
            <p className="text-muted">Saved ({feedback.words} words). {feedback.note}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Reader({ passage, completed, bestScore }: { passage: ReaderPassage; completed: boolean; bestScore: number | null }) {
  const listening = passage.kind === "LISTENING";
  const [showText, setShowText] = useState(!listening);
  const [showTr, setShowTr] = useState(false);
  const [done, setDone] = useState<{ score: number; passed: boolean; xp: number } | null>(null);
  const lines = useMemo(() => {
    if (!passage.speakers.length) return null;
    const names = new Map(passage.speakers.map((s) => [s.id, s.name]));
    return passage.body.split("\n").filter(Boolean).map((l, i) => {
      const m = l.match(/^([A-Za-z0-9_]{1,12}):\s*(.+)$/);
      return { speaker: m ? names.get(m[1]!) ?? m[1]! : "", text: (m ? m[2]! : l).split("|")[0]!.trim(), audio: passage.lineAudio[i] };
    });
  }, [passage]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <article className="card px-5 py-7 sm:px-10 sm:py-9">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="navy">{passage.level}</Badge>
          <Badge tone="outline">{passage.wordCount} words · ~{passage.minutes} min</Badge>
          {completed && <Badge tone="success">Completed{bestScore !== null ? ` · ${Math.round(bestScore * 100)}%` : ""}</Badge>}
        </div>
        <h1 className="display mt-4 text-3xl sm:text-4xl">{passage.title}</h1>
        <p className="mt-2 text-muted">{passage.summary}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {!listening && passage.audio && <AudioButton audio={passage.audio} text={passage.body} lang={passage.language} label="Listen to the text" showSlow={false} />}
          {listening && (
            <button type="button" onClick={() => setShowText((s) => !s)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-navy-800 hover:bg-navy-50" aria-pressed={showText}>
              {showText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {showText ? "Hide" : "Show"} transcript
            </button>
          )}
          {passage.translation && (
            <button type="button" onClick={() => setShowTr((s) => !s)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-navy-800 hover:bg-navy-50" aria-pressed={showTr}>
              <Globe2 className="h-4 w-4" /> {showTr ? "Hide" : "Show"} translation
            </button>
          )}
        </div>
        {listening && <div className="mt-5"><ListeningPlayer passage={passage} /></div>}
        {listening && !showText && <p className="mt-5 text-sm text-muted">Listen first and answer the questions, then check the transcript.</p>}
        {showText && (
          <div className="mt-7">
            {lines ? (
              <ol className="space-y-3">
                {lines.map((l, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <AudioButton audio={l.audio} text={l.text} lang={passage.language} size="sm" showSlow={false} />
                    <p className="reading-text"><span className="mr-1.5 font-sans text-sm font-semibold text-muted">{l.speaker}</span><InteractiveText text={l.text} language={passage.language} glossary={passage.glossary} slug={passage.slug} /></p>
                  </li>
                ))}
              </ol>
            ) : (
              <InteractiveText text={passage.body} language={passage.language} glossary={passage.glossary} slug={passage.slug} />
            )}
            <p className="mt-4 text-xs text-subtle">Tap any word for its meaning and to save it to your notebook. Underlined words are in the glossary.</p>
          </div>
        )}
        {showTr && passage.translation && <div className="mt-6 rounded-xl bg-canvas px-5 py-4 text-sm leading-relaxed whitespace-pre-line text-muted">{passage.translation}</div>}

        <section className="mt-10 border-t border-line pt-8" aria-labelledby="q-title">
          <h2 id="q-title" className="font-serif text-2xl text-navy-900">Comprehension</h2>
          <div className="mt-4"><Questions passage={passage} onDone={setDone} /></div>
          {done && (
            <Alert tone={done.passed ? "success" : "warning"} className="mt-4">
              {Math.round(done.score * 100)}% correct. {done.passed ? (done.xp ? `+${done.xp} XP — passage completed.` : "Passage completed.") : "Reach 60% to complete the passage — read it again and retry."}
            </Alert>
          )}
        </section>
        <section className="mt-10 border-t border-line pt-8" aria-labelledby="s-title">
          <h2 id="s-title" className="font-serif text-2xl text-navy-900">Summarise</h2>
          <div className="mt-4"><SummaryBox passage={passage} /></div>
        </section>
      </article>
      <aside className="space-y-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-navy-900">Glossary</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {passage.glossary.map((g) => (
              <li key={g.term}><span className="font-medium text-navy-900" lang={passage.language}>{g.term}</span> <span className="text-muted">— {g.translation}</span></li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-navy-900">Talk about it</h2>
          <p className="mt-1.5 text-sm text-muted">Discuss this text with the AI coach — your opinion, related experiences and new words.</p>
          <ButtonLink href={`/coach?passage=${passage.slug}`} variant="outline" size="sm" className="mt-3"><MessagesSquare className="h-4 w-4" /> Start a conversation</ButtonLink>
        </div>
      </aside>
    </div>
  );
}
