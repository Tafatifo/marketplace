"use client";

import type { Alignment } from "@/lib/align";

export interface TimedWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

/**
 * Word-level feedback. Colours: navy = recognised, red = possible mismatch,
 * grey dashed = uncertain (recognised but with low recogniser confidence).
 */
export function WordFeedback({
  alignment,
  timings,
  onWordClick,
  className,
}: {
  alignment: Alignment;
  timings?: TimedWord[];
  onWordClick?: (start: number, end: number) => void;
  className?: string;
}) {
  // Map recognised words (in order) to their timings for replay.
  let t = 0;
  return (
    <div className={className}>
      <p className="font-serif text-lg leading-loose">
        {alignment.words.map((w, i) => {
          let timing: TimedWord | undefined;
          if ((w.status === "match" || w.status === "close" || w.status === "substituted") && timings && t < timings.length) timing = timings[t++];
          const uncertain = timing?.confidence !== undefined && timing.confidence < 0.5 && (w.status === "match" || w.status === "close");
          const cls =
            w.status === "match"
              ? uncertain
                ? "text-muted decoration-dashed decoration-navy-300 underline underline-offset-[6px]"
                : "text-navy-800"
              : w.status === "close"
                ? "text-navy-800 underline decoration-gold-400 decoration-2 underline-offset-[6px]"
                : "rounded bg-danger-50 px-1 text-danger-700 underline decoration-danger-600/40 decoration-2 underline-offset-[6px]";
          const label =
            w.status === "match" ? (uncertain ? "recognised, low confidence" : "recognised") : w.status === "close" ? `close — heard “${w.heard}”` : w.status === "missing" ? "not recognised" : `heard “${w.heard}”`;
          const content = <span className={cls}>{w.word}</span>;
          return (
            <span key={i}>
              {timing && onWordClick ? (
                <button type="button" onClick={() => onWordClick(timing!.start, timing!.end)} className="cursor-pointer rounded hover:bg-navy-50" title={`${label} — click to replay this word`} aria-label={`${w.word}: ${label}. Replay this part of your recording.`}>
                  {content}
                </button>
              ) : (
                <span title={label} aria-label={`${w.word}: ${label}`}>{content}</span>
              )}{" "}
            </span>
          );
        })}
      </p>
      {alignment.extra.length > 0 && (
        <p className="mt-1 text-xs text-muted">Also heard: {alignment.extra.join(", ")}</p>
      )}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-navy-700" /> Recognised</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold-400" /> Close</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-danger-600" /> Possible mismatch</li>
        {timings?.some((x) => x.confidence !== undefined) && (
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-subtle" /> Uncertain</li>
        )}
      </ul>
    </div>
  );
}
