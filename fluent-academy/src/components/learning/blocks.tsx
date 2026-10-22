"use client";

import { useState } from "react";
import { BookmarkCheck, BookmarkPlus, CheckCircle2, Globe2, MessageCircleWarning, Mic, PenLine, Play, Quote, Users } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import type { LessonBlock, VocabEntry } from "@/content/types";
import { AudioButton, useAudio } from "./audio";

export function SaveWordButton({
  item,
  language,
  source,
  initiallySaved = false,
  size = "md",
}: {
  item: { key?: string; term: string; gloss: string; example?: string; pos?: string };
  language: string;
  source: { type: "LESSON" | "READING" | "CONVERSATION" | "MANUAL"; id?: string; context?: string };
  initiallySaved?: boolean;
  size?: "sm" | "md";
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (saved || busy) return;
    setBusy(true);
    try {
      await api("/api/vocabulary", {
        body: {
          language,
          term: item.term,
          translation: item.gloss,
          example: item.example,
          partOfSpeech: item.pos,
          vocabularyItemKey: item.key,
          sourceType: source.type,
          sourceId: source.id,
          sourceContext: source.context ?? item.example,
        },
      });
      setSaved(true);
    } catch {
      // Leave the button available to retry.
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={save}
      disabled={busy}
      aria-pressed={saved}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1 rounded-full transition-colors",
        size === "sm" ? "h-7 w-7" : "h-9 w-9",
        saved ? "bg-gold-100 text-gold-700" : "bg-white text-navy-700 ring-1 ring-line hover:bg-navy-50",
      )}
      aria-label={saved ? `“${item.term}” is in your notebook` : `Save “${item.term}” to your notebook`}
      title={saved ? "In your notebook" : "Save to notebook"}
    >
      {saved ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
    </button>
  );
}

function BlockShell({ icon, eyebrow, title, children }: { icon?: React.ReactNode; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card px-5 py-6 sm:px-8 sm:py-8">
      <p className="eyebrow flex items-center gap-2">
        {icon}
        {eyebrow}
      </p>
      <h2 className="display mt-2 text-2xl">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function VocabularyBlock({ items, language, lessonId, savedTerms, monolingual }: { items: VocabEntry[]; language: string; lessonId: string; savedTerms: Set<string>; monolingual: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((v) => (
        <li key={v.key} className="flex gap-3 py-4 first:pt-0 last:pb-0">
          <AudioButton audio={v.audio} text={v.term} lang={language} showSlow />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-serif text-lg font-semibold text-navy-900" lang={language}>{v.term}</span>
              {v.pos && <span className="text-xs text-subtle italic">{v.pos}</span>}
              {v.gender && <span className="text-xs text-subtle">({v.gender})</span>}
              {v.ipa && <span className="text-xs text-muted">/{v.ipa}/</span>}
            </p>
            <p className="text-sm text-ink">{monolingual ? <span className="text-muted">Meaning: </span> : null}{v.gloss}</p>
            <div className="mt-1.5 flex items-start gap-2">
              <AudioButton audio={v.exampleAudio} text={v.example} lang={language} size="sm" showSlow={false} label="Play example" />
              <p className="text-sm">
                <span className="text-navy-800 italic" lang={language}>{v.example}</span>
                {v.exampleTranslation && <span className="text-muted"> — {v.exampleTranslation}</span>}
              </p>
            </div>
            {(v.collocations.length > 0 || v.note || v.translations) && (
              <div className="mt-1.5 space-y-0.5 text-xs text-muted">
                {v.collocations.length > 0 && <p><span className="font-medium text-navy-800">Common with:</span> <span lang={language}>{v.collocations.join(" · ")}</span></p>}
                {v.note && <p><span className="font-medium text-navy-800">Usage:</span> {v.note}</p>}
                {v.translations && Object.keys(v.translations).length > 0 && (
                  <p><span className="font-medium text-navy-800">Translations:</span> {Object.entries(v.translations).map(([l, t]) => `${l.toUpperCase()} ${t}`).join(" · ")}</p>
                )}
              </div>
            )}
          </div>
          <SaveWordButton item={v} language={language} source={{ type: "LESSON", id: lessonId }} initiallySaved={savedTerms.has(v.term.toLowerCase())} />
        </li>
      ))}
    </ul>
  );
}

function DialogueBlock({ block, language }: { block: Extract<LessonBlock, { type: "dialogue" }>; language: string }) {
  const [showTr, setShowTr] = useState(false);
  const { play, playing } = useAudio();
  const [autoIndex, setAutoIndex] = useState<number | null>(null);
  const names = new Map(block.speakers.map((s) => [s.id, s]));
  const playAll = () => {
    // Play line by line so the current line can be highlighted.
    const run = (i: number) => {
      if (i >= block.lines.length) return setAutoIndex(null);
      const line = block.lines[i]!;
      setAutoIndex(i);
      const a = new Audio(`${process.env.NEXT_PUBLIC_AUDIO_BASE_URL || "/audio"}/${line.audio?.key}`);
      a.onended = () => setTimeout(() => run(i + 1), 350);
      a.onerror = () => setTimeout(() => run(i + 1), 100);
      a.play().catch(() => setAutoIndex(null));
    };
    run(0);
  };
  return (
    <>
      {block.setting && <p className="mb-4 text-sm text-muted italic">{block.setting}</p>}
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={playAll} className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-navy-800">
          <Play className="h-3.5 w-3.5 fill-current" /> Play conversation
        </button>
        {block.lines.some((l) => l.translation) && (
          <button type="button" onClick={() => setShowTr((s) => !s)} aria-pressed={showTr} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium text-navy-800 hover:bg-navy-50">
            <Globe2 className="h-3.5 w-3.5" /> {showTr ? "Hide" : "Show"} translation
          </button>
        )}
      </div>
      <ol className="space-y-3">
        {block.lines.map((l, i) => {
          const sp = names.get(l.speaker);
          const right = block.speakers.findIndex((s) => s.id === l.speaker) % 2 === 1;
          return (
            <li key={i} className={cn("flex gap-3", right && "flex-row-reverse text-right")}>
              <span className={cn("mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-serif text-sm font-semibold", right ? "bg-gold-100 text-gold-700" : "bg-navy-100 text-navy-800")} aria-hidden>
                {sp?.name.replace(/^(M\.|Mme|Mr|Mrs|Herr|Frau|Sr\.|Sra\.)\s*/, "").slice(0, 1)}
              </span>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 transition-shadow", right ? "rounded-tr-sm bg-navy-50" : "rounded-tl-sm bg-canvas", autoIndex === i && "ring-2 ring-gold-400")}>
                <p className="text-xs font-semibold text-muted">{sp?.name}</p>
                <div className={cn("flex items-start gap-2", right && "flex-row-reverse")}>
                  <p className="text-[0.98rem] text-ink" lang={language}>{l.text}</p>
                  {l.audio && (
                    <button type="button" onClick={() => play(l.audio!.key, { text: l.text, lang: language })} className="mt-0.5 shrink-0 text-navy-600 hover:text-navy-900" aria-label={`Play: ${l.text}`}>
                      <Play className={cn("h-3.5 w-3.5", playing === l.audio.key && "fill-current")} />
                    </button>
                  )}
                </div>
                {showTr && l.translation && <p className="mt-1 text-sm text-muted">{l.translation}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function LessonBlockView({
  block,
  language,
  lessonId,
  savedTerms,
}: {
  block: LessonBlock;
  language: string;
  lessonId: string;
  savedTerms: Set<string>;
}) {
  switch (block.type) {
    case "intro":
      return (
        <BlockShell eyebrow="Overview" title={block.title}>
          <Markdown text={block.body} className="text-[1.02rem] text-ink" />
        </BlockShell>
      );
    case "vocabulary":
      return (
        <BlockShell eyebrow={`${block.items.length} words & phrases`} title={block.title}>
          <VocabularyBlock items={block.items} language={language} lessonId={lessonId} savedTerms={savedTerms} monolingual={language === "en"} />
        </BlockShell>
      );
    case "grammar":
      return (
        <BlockShell eyebrow="Grammar in context" title={block.title}>
          <Markdown text={block.body} className="text-[0.98rem] text-ink" />
          {block.table && (
            <div className="mt-5 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[22rem] text-left text-sm">
                <thead className="bg-navy-50/70 text-xs tracking-wide text-muted uppercase">
                  <tr>{block.table.head.map((h) => <th key={h} className="px-4 py-2.5 font-medium" scope="col">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {block.table.rows.map((r, i) => (
                    <tr key={i}>{r.map((c, j) => <td key={j} className={cn("px-4 py-2.5", j === 1 ? "font-semibold text-navy-900" : "text-ink")} lang={language}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {block.examples.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Worked examples</h3>
              <ul className="mt-2 space-y-2.5">
                {block.examples.map((e, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl bg-canvas px-4 py-3">
                    <AudioButton audio={e.audio} text={e.text} lang={language} size="sm" />
                    <div>
                      <p className="font-medium text-navy-900" lang={language}>{e.text}</p>
                      {e.translation && <p className="text-sm text-muted">{e.translation}</p>}
                      {e.note && <p className="mt-0.5 text-xs text-gold-700">{e.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {block.tip && (
            <p className="mt-5 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-navy-900"><span className="font-semibold text-gold-700">Tip · </span>{block.tip}</p>
          )}
        </BlockShell>
      );
    case "dialogue":
      return (
        <BlockShell eyebrow="Listen & read" title={block.title} icon={<Users className="h-3.5 w-3.5" />}>
          <DialogueBlock block={block} language={language} />
        </BlockShell>
      );
    case "reading":
      return (
        <BlockShell eyebrow="Read" title={block.title}>
          <div className="mb-3"><AudioButton audio={block.audio} text={block.text} lang={language} label="Listen to the text" /></div>
          <div className="reading-text whitespace-pre-line" lang={language}>{block.text}</div>
          {block.translation && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium text-navy-800">Show translation</summary>
              <p className="mt-2 whitespace-pre-line text-muted">{block.translation}</p>
            </details>
          )}
        </BlockShell>
      );
    case "pronunciation":
      return (
        <BlockShell eyebrow="Pronunciation" title={block.title} icon={<Mic className="h-3.5 w-3.5" />}>
          <Markdown text={block.body} className="text-[0.98rem] text-ink" />
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {block.items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                <AudioButton audio={it.audio} text={it.text} lang={language} size="sm" />
                <span className="font-medium text-navy-900" lang={language}>{it.text}</span>
                {it.ipa && <span className="ml-auto text-xs text-muted">{it.ipa}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Model audio is synthesised from text. Listen at normal and slow speed, then try the speaking exercises in the practice section.</p>
        </BlockShell>
      );
    case "culture":
      return (
        <BlockShell eyebrow="Culture" title={block.title} icon={<Globe2 className="h-3.5 w-3.5" />}>
          <Markdown text={block.body} className="text-[0.98rem] text-ink" />
        </BlockShell>
      );
    case "mistakes":
      return (
        <BlockShell eyebrow="Avoid these" title={block.title} icon={<MessageCircleWarning className="h-3.5 w-3.5" />}>
          <ul className="space-y-3">
            {block.items.map((m, i) => (
              <li key={i} className="rounded-xl border border-line px-4 py-3">
                <p className="text-sm"><span className="mr-2 text-xs font-semibold text-danger-600 uppercase">Not</span><s className="text-danger-700/80" lang={language}>{m.wrong}</s></p>
                <p className="mt-1 text-sm"><span className="mr-2 text-xs font-semibold text-success-700 uppercase">But</span><span className="font-medium text-navy-900" lang={language}>{m.right}</span></p>
                <p className="mt-1.5 text-sm text-muted">{m.why}</p>
              </li>
            ))}
          </ul>
        </BlockShell>
      );
    case "task":
      return (
        <BlockShell eyebrow={block.mode === "writing" ? "Writing task" : block.mode === "interaction" ? "Real-world task" : "Speaking task"} title={block.title} icon={<PenLine className="h-3.5 w-3.5" />}>
          <Markdown text={block.body} className="text-[0.98rem] text-ink" />
        </BlockShell>
      );
    case "summary":
      return (
        <BlockShell eyebrow="Unit summary" title={block.title} icon={<Quote className="h-3.5 w-3.5" />}>
          <ul className="space-y-2">
            {block.points.map((p) => <li key={p} className="flex gap-2 text-ink"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />{p}</li>)}
          </ul>
        </BlockShell>
      );
    case "cando":
      return (
        <BlockShell eyebrow="Self-check" title={block.title}>
          <ul className="space-y-2">
            {block.items.map((p) => <li key={p} className="flex gap-2 text-ink"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-navy-400" />{p}</li>)}
          </ul>
        </BlockShell>
      );
  }
}
