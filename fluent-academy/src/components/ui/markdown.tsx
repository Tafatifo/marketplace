import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A deliberately small Markdown renderer for curriculum text: paragraphs,
 * bullet/numbered lists, **bold**, *italic*, ~~strike~~ and `code`.
 * It builds React elements directly, so content can never inject HTML.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k} className="font-semibold text-navy-900">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("~~")) out.push(<s key={k} className="text-danger-600/80">{tok.slice(2, -2)}</s>);
    else if (tok.startsWith("`")) out.push(<code key={k} className="rounded bg-navy-50 px-1 py-0.5 text-[0.9em]">{tok.slice(1, -1)}</code>);
    else out.push(<em key={k} className="text-navy-800">{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className={cn("space-y-3 leading-relaxed", className)}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").map((l) => l.trimEnd());
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={bi} className="list-disc space-y-1.5 pl-5 marker:text-navy-300">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
          return (
            <ol key={bi} className="list-decimal space-y-1.5 pl-5 marker:text-navy-400">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*\d+\.\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
