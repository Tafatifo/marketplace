"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookmarkPlus, CheckCircle2, Flag, Globe2, Lightbulb, Loader2, Mic, Send, Sparkles, Volume2, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/primitives";
import { Recorder, type SpeechConfig } from "@/components/learning/recorder";
import { SaveWordButton } from "@/components/learning/blocks";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { localeFor } from "@/content/voices";

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  translation: string | null;
  corrections: { original: string; corrected: string; explanation: string; category: string; severity: "minor" | "important" }[];
  vocabulary: { term: string; translation: string }[];
  hint: string | null;
}

export interface ReviewData {
  source: "ai" | "practice";
  summary: string;
  strengths: string[];
  keyMistakes: ChatMessage["corrections"];
  correctedSentences: { original: string; corrected: string }[];
  newVocabulary: { term: string; translation: string; example: string }[];
  grammarPatterns: { pattern: string; explanation: string; category: string }[];
  suggestedNextScenario: string;
  recommendedLessons?: { slug: string; title: string }[];
}


function speakFallback(text: string, lang: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = localeFor(lang);
  window.speechSynthesis.speak(u);
}

function TutorAudio({ text, language }: { text: string; language: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const play = async () => {
    setState("loading");
    try {
      const res = await api<{ url: string | null }>("/api/speech/tts", { body: { text, language } });
      if (!res.url) {
        speakFallback(text, language);
        setState("idle");
        return;
      }
      const a = new Audio(res.url);
      a.onended = () => setState("idle");
      a.onerror = () => {
        speakFallback(text, language);
        setState("idle");
      };
      setState("playing");
      await a.play();
    } catch {
      speakFallback(text, language);
      setState("idle");
    }
  };
  return (
    <button type="button" onClick={play} className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-900" aria-label="Listen to this reply">
      {state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />} Listen
    </button>
  );
}

export function CoachChat({
  conversationId,
  language,
  scenarioTitle,
  goals,
  initialMessages,
  isPractice,
  providerLabel,
  ended,
  review,
  speech,
  correctionMode,
  nextScenarioTitle,
}: {
  conversationId: string;
  language: string;
  scenarioTitle: string;
  goals: string[];
  initialMessages: ChatMessage[];
  isPractice: boolean;
  providerLabel: string;
  ended: boolean;
  review: ReviewData | null;
  speech: SpeechConfig;
  correctionMode: string;
  nextScenarioTitle?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<{ msg: string; upgrade?: boolean } | null>(null);
  const [showTr, setShowTr] = useState(false);
  const [voice, setVoice] = useState(false);
  const [scriptDone, setScriptDone] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const last = messages.at(-1);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    const temp: ChatMessage = { id: `tmp-${Date.now()}`, role: "USER", content: t, translation: null, corrections: [], vocabulary: [], hint: null };
    setMessages((m) => [...m, temp]);
    setText("");
    try {
      const res = await api<{ userMessage: ChatMessage; reply: ChatMessage; finished: boolean }>(`/api/coach/conversations/${conversationId}/messages`, { body: { text: t } });
      setMessages((m) => [...m.filter((x) => x.id !== temp.id), res.userMessage, res.reply]);
      if (res.finished) setScriptDone(true);
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setText(t);
      setError(err instanceof ApiError ? { msg: err.message, upgrade: err.status === 402 } : { msg: "Your message wasn't sent. Please try again." });
    } finally {
      setSending(false);
    }
  };

  const end = async () => {
    setEnding(true);
    setError(null);
    try {
      await api(`/api/coach/conversations/${conversationId}/end`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError({ msg: err instanceof ApiError ? err.message : "Couldn't finish the conversation." });
      setEnding(false);
    }
  };

  const userCount = messages.filter((m) => m.role === "USER").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="card flex min-h-[70vh] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h1 className="font-semibold text-navy-900">{scenarioTitle}</h1>
            <p className="text-xs text-muted">{correctionMode.toLowerCase()} corrections · {isPractice ? "Practice mode (scripted tutor)" : providerLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowTr((s) => !s)} aria-pressed={showTr} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-navy-800 hover:bg-navy-50">
              <Globe2 className="h-3.5 w-3.5" /> Translations
            </button>
            {!ended && (
              <Button size="sm" variant="secondary" onClick={end} loading={ending} disabled={userCount === 0}>
                <Flag className="h-3.5 w-3.5" /> End & review
              </Button>
            )}
          </div>
        </div>
        {isPractice && (
          <div className="border-b border-gold-200 bg-gold-50 px-5 py-2.5 text-xs text-gold-700">
            <strong>Practice mode.</strong> No AI model is connected, so this is a scripted conversation with rule-based checks for a few common mistakes. It won&apos;t understand everything you write.
          </div>
        )}
        <ol className="flex-1 space-y-4 overflow-y-auto bg-canvas/50 px-4 py-5 sm:px-6" aria-live="polite" aria-label="Conversation">
          {messages.map((m) =>
            m.role === "ASSISTANT" ? (
              <li key={m.id} className="max-w-[88%]">
                <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-line">
                  <p className="text-[0.98rem] leading-relaxed text-ink" lang={language}>{m.content}</p>
                  {showTr && m.translation && <p className="mt-1.5 text-sm text-muted">{m.translation}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <TutorAudio text={m.content} language={language} />
                  </div>
                </div>
                {m.vocabulary.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {m.vocabulary.map((v) => (
                      <li key={v.term} className="flex items-center gap-1.5 rounded-full bg-white py-1 pr-1 pl-3 text-xs ring-1 ring-line">
                        <span className="font-medium text-navy-900" lang={language}>{v.term}</span>
                        <span className="text-muted">{v.translation}</span>
                        <SaveWordButton size="sm" item={{ term: v.term, gloss: v.translation }} language={language} source={{ type: "CONVERSATION", id: conversationId, context: m.content }} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ) : (
              <li key={m.id} className="ml-auto max-w-[88%]">
                <div className="rounded-2xl rounded-tr-sm bg-navy-900 px-4 py-3 text-white">
                  <p className="text-[0.98rem] leading-relaxed" lang={language}>{m.content}</p>
                </div>
                {m.corrections.map((c, i) => (
                  <div key={i} className={cn("mt-2 rounded-xl border px-3.5 py-2.5 text-sm", c.severity === "important" ? "border-gold-200 bg-gold-50" : "border-line bg-white")}>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-gold-700"><Sparkles className="h-3.5 w-3.5" /> {c.severity === "important" ? "Correction" : "Small improvement"}</p>
                    <p className="mt-1" lang={language}>
                      <s className="text-subtle">{c.original}</s> → <span className="font-semibold text-navy-900">{c.corrected}</span>
                    </p>
                    <p className="mt-0.5 text-muted">{c.explanation}</p>
                  </div>
                ))}
              </li>
            ),
          )}
          {sending && (
            <li className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> The coach is replying…</li>
          )}
          <div ref={bottom} />
        </ol>

        {!ended ? (
          <div className="border-t border-line bg-white px-4 py-4 sm:px-5">
            {error && (
              <Alert tone={error.upgrade ? "warning" : "danger"} className="mb-3">
                {error.msg} {error.upgrade && <Link href="/billing" className="font-semibold underline">See Premium</Link>}
              </Alert>
            )}
            {scriptDone && <Alert tone="success" className="mb-3">That&apos;s the end of this scenario. End the conversation to see your review.</Alert>}
            {last?.role === "ASSISTANT" && last.hint && !scriptDone && (
              <details className="mb-3 text-sm">
                <summary className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-navy-700"><Lightbulb className="h-4 w-4" /> Need an idea?</summary>
                <p className="mt-1.5 rounded-lg bg-canvas px-3 py-2 text-ink" lang={language}>{last.hint}</p>
              </details>
            )}
            {voice && (
              <div className="mb-3">
                <Recorder
                  compact
                  language={language}
                  context="CONVERSATION"
                  sourceId={conversationId}
                  speech={speech}
                  onResult={(r) => {
                    if (r.transcript) setText((t) => (t ? `${t} ${r.transcript}` : r.transcript));
                    setVoice(false);
                  }}
                />
                <p className="mt-1 text-xs text-muted">Your speech is transcribed into the box below so you can check it before sending.</p>
              </div>
            )}
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => setVoice((v) => !v)} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors", voice ? "border-navy-700 bg-navy-50 text-navy-900" : "border-line text-navy-700 hover:bg-navy-50")} aria-label={voice ? "Close voice input" : "Speak your message"} aria-pressed={voice}>
                {voice ? <X className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <label htmlFor="coach-input" className="sr-only">Your message</label>
              <textarea
                id="coach-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                maxLength={800}
                lang={language}
                placeholder="Write your reply…"
                className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-line px-3.5 py-2.5 text-[0.95rem] focus:border-navy-400 focus:ring-4 focus:ring-navy-100 focus:outline-none"
              />
              <Button onClick={send} disabled={!text.trim()} loading={sending} size="icon" className="h-11 w-11 shrink-0" aria-label="Send message">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-line bg-white px-5 py-4 text-sm text-muted">This conversation has ended. Your review is below.</div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-navy-900">Your goals</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {goals.map((g) => <li key={g} className="flex gap-2 text-ink"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-navy-300" />{g}</li>)}
          </ul>
        </div>
        <div className="card p-5 text-sm text-muted">
          <p className="font-semibold text-navy-900">Tips</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4">
            <li>Write full sentences — the more you produce, the more useful the feedback.</li>
            <li>Not sure of a word? Write it in English in brackets; the coach will supply it.</li>
            <li>Press Enter to send, Shift + Enter for a new line.</li>
          </ul>
        </div>
      </aside>

      {ended && review && (
        <section className="card lg:col-span-2" aria-labelledby="review-title">
          <div className="border-b border-line px-6 py-5">
            <p className="eyebrow">Session review{review.source === "practice" ? " · rule-based (practice mode)" : ""}</p>
            <h2 id="review-title" className="display mt-1 text-2xl">How it went</h2>
            <p className="mt-2 max-w-3xl text-ink">{review.summary}</p>
            {review.strengths.length > 0 && <p className="mt-2 text-sm text-success-700">Strengths: {review.strengths.join(" · ")}</p>}
          </div>
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold tracking-wide text-navy-900 uppercase">Key mistakes</h3>
              {review.keyMistakes.length === 0 ? <p className="mt-2 text-sm text-muted">No important mistakes were flagged.</p> : (
                <ul className="mt-3 space-y-3">
                  {review.keyMistakes.map((c, i) => (
                    <li key={i} className="rounded-xl border border-line px-4 py-3 text-sm">
                      <p lang={language}><s className="text-subtle">{c.original}</s> → <span className="font-semibold text-navy-900">{c.corrected}</span></p>
                      <p className="mt-1 text-muted">{c.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
              {review.correctedSentences.length > 0 && (
                <>
                  <h3 className="mt-6 text-sm font-semibold tracking-wide text-navy-900 uppercase">Your sentences, improved</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {review.correctedSentences.map((s, i) => (
                      <li key={i} lang={language}><p className="text-muted">{s.original}</p><p className="font-medium text-navy-900">{s.corrected}</p></li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-wide text-navy-900 uppercase">New vocabulary</h3>
              {review.newVocabulary.length === 0 ? <p className="mt-2 text-sm text-muted">—</p> : (
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {review.newVocabulary.map((v) => (
                    <li key={v.term} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-navy-900" lang={language}>{v.term} <span className="font-normal text-muted">— {v.translation}</span></p>
                        {v.example && <p className="text-xs text-muted italic" lang={language}>{v.example}</p>}
                      </div>
                      <SaveWordButton size="sm" item={{ term: v.term, gloss: v.translation, example: v.example || undefined }} language={language} source={{ type: "CONVERSATION", id: conversationId }} />
                    </li>
                  ))}
                </ul>
              )}
              {review.grammarPatterns.length > 0 && (
                <>
                  <h3 className="mt-6 text-sm font-semibold tracking-wide text-navy-900 uppercase">Grammar to review</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {review.grammarPatterns.map((g, i) => <li key={i}><span className="font-medium text-navy-900">{g.pattern}</span> — <span className="text-muted">{g.explanation}</span></li>)}
                  </ul>
                </>
              )}
              <div className="mt-6 flex flex-wrap gap-2">
                {review.recommendedLessons?.map((l) => (
                  <ButtonLink key={l.slug} href={`/learn/${l.slug}`} variant="outline" size="sm"><BookmarkPlus className="h-3.5 w-3.5" /> {l.title}</ButtonLink>
                ))}
                <ButtonLink href="/review" variant="outline" size="sm">Practise mistakes</ButtonLink>
                <ButtonLink href={`/coach?scenario=${review.suggestedNextScenario}`} size="sm">Next: {nextScenarioTitle ?? "another scenario"} <ArrowRight className="h-3.5 w-3.5" /></ButtonLink>
              </div>
            </div>
          </div>
          {review.source === "ai" && <p className="border-t border-line px-6 py-3 text-xs text-subtle">Feedback was generated by an AI model and may occasionally be wrong. <Badge tone="neutral">AI-generated</Badge></p>}
        </section>
      )}
    </div>
  );
}
