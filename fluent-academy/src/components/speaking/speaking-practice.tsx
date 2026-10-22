"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Info, Shuffle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/primitives";
import { AudioButton } from "@/components/learning/audio";
import { Recorder, type SpeakingAttemptResult, type SpeechConfig } from "@/components/learning/recorder";
import { WordFeedback } from "@/components/learning/word-feedback";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { PracticeSentence } from "@/server/speech/practice";

function ScorePill({ label, value }: { label: string; value?: number }) {
  if (value === undefined) return null;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-center ring-1 ring-line">
      <p className="text-lg font-semibold text-navy-900 tabular-nums">{Math.round(value)}</p>
      <p className="text-[0.68rem] text-muted">{label}</p>
    </div>
  );
}

export function AttemptResult({ attempt, language }: { attempt: SpeakingAttemptResult; language: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAt = useRef<number | null>(null);
  const replay = (start: number, end: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, start - 0.05);
    stopAt.current = end + 0.08;
    void a.play();
  };
  return (
    <div className="space-y-4">
      {attempt.pronunciation && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <ScorePill label="Overall" value={attempt.pronunciation.overall} />
          <ScorePill label="Accuracy" value={attempt.pronunciation.accuracy} />
          <ScorePill label="Fluency" value={attempt.pronunciation.fluency} />
          <ScorePill label="Completeness" value={attempt.pronunciation.completeness} />
          <ScorePill label="Prosody" value={attempt.pronunciation.prosody} />
        </div>
      )}
      {attempt.alignment ? (
        <WordFeedback alignment={attempt.alignment} timings={attempt.audioUrl ? attempt.timings : undefined} onWordClick={attempt.audioUrl ? replay : undefined} />
      ) : (
        <p className="text-sm text-ink"><span className="text-muted">Recognised: </span><span lang={language}>{attempt.transcript || "—"}</span></p>
      )}
      {attempt.audioUrl && (
        <audio
          ref={audioRef}
          src={attempt.audioUrl}
          controls
          className="h-9 w-full"
          onTimeUpdate={(e) => {
            if (stopAt.current !== null && e.currentTarget.currentTime >= stopAt.current) {
              e.currentTarget.pause();
              stopAt.current = null;
            }
          }}
          aria-label="Your recording"
        />
      )}
      <div className="rounded-xl bg-canvas px-4 py-3 text-sm">
        <p className="font-medium text-navy-900">{attempt.feedback.summary}</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink">
          {attempt.feedback.tips.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <p className="mt-2 flex gap-1.5 text-xs text-muted"><Info className="mt-0.5 h-3 w-3 shrink-0" />{attempt.feedback.caveat}</p>
        <p className="mt-1 text-xs text-subtle">{attempt.providerLabel}{attempt.isSimulated ? " · simulated (test mode)" : ""}{attempt.timings.length && attempt.audioUrl ? " · click a word to replay that part of your recording" : ""}</p>
      </div>
    </div>
  );
}

export function SpeakingPractice({
  language,
  sentences,
  speech,
  history,
  focusLabel,
}: {
  language: string;
  sentences: PracticeSentence[];
  speech: SpeechConfig;
  history: (SpeakingAttemptResult & { targetText: string | null; createdAt: string | Date })[];
  focusLabel?: string;
}) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [result, setResult] = useState<SpeakingAttemptResult | null>(null);
  const [items, setItems] = useState(history);
  const s = sentences[i];

  const go = (d: number) => {
    setI((x) => (x + d + sentences.length) % sentences.length);
    setResult(null);
  };
  const remove = async (id: string) => {
    setItems((h) => h.filter((x) => x.id !== id));
    await api(`/api/speech/attempts/${id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader
          title="Say it aloud"
          description={focusLabel ? `Sentences containing ${focusLabel}` : "Sentences from your lessons, with model audio."}
          action={sentences.length > 1 ? (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => go(-1)} aria-label="Previous sentence"><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => go(Math.floor(Math.random() * sentences.length))} aria-label="Random sentence"><Shuffle className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => go(1)} aria-label="Next sentence"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          ) : undefined}
        />
        <CardBody className="space-y-5">
          {!s ? (
            <EmptyState title="No practice sentences yet" description="Open a lesson first — its dialogue and example sentences become your speaking practice." />
          ) : (
            <>
              <div className="rounded-xl border border-line px-5 py-5">
                <div className="flex items-start gap-4">
                  <AudioButton audio={s.audio} text={s.text} lang={language} size="lg" variant="solid" />
                  <div className="min-w-0">
                    <p className="font-serif text-2xl leading-snug text-navy-900" lang={language}>{s.text}</p>
                    {s.translation && <p className="mt-1.5 text-sm text-muted">{s.translation}</p>}
                    <p className="mt-2 text-xs text-subtle">From “{s.source}” · {i + 1} of {sentences.length}</p>
                  </div>
                </div>
              </div>
              <Recorder key={i} language={language} targetText={s.text} context="SENTENCE" speech={speech} onResult={(r) => { setResult(r); setItems((h) => [{ ...r, targetText: s.text, createdAt: new Date() }, ...h]); }} />
              {result && <AttemptResult attempt={result} language={language} />}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recent recordings" description="Recordings are deleted automatically after your retention period." />
        <CardBody>
          {items.length === 0 ? (
            <p className="text-sm text-muted">Your practice history will appear here.</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.slice(0, 12).map((h) => (
                <li key={h.id} className="flex items-start gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-navy-900" lang={language}>{h.targetText ?? h.transcript}</p>
                    <p className="truncate text-xs text-muted" lang={language}>Heard: {h.transcript || "—"}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-subtle">
                      {h.matchScore !== null && <Badge tone={h.matchScore >= 0.85 ? "success" : h.matchScore >= 0.7 ? "gold" : "danger"}>{Math.round(h.matchScore * 100)}% recognised</Badge>}
                      {h.pronunciation?.overall !== undefined && <Badge tone="navy">Pron. {Math.round(h.pronunciation.overall)}</Badge>}
                      {timeAgo(h.createdAt)}
                    </p>
                    {h.audioUrl && <audio src={h.audioUrl} controls preload="none" className="mt-2 h-8 w-full" aria-label="Recording" />}
                  </div>
                  <button type="button" onClick={() => remove(h.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-danger-50 hover:text-danger-600" aria-label="Delete this recording">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
