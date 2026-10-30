import { Mic, Sparkles, Volume2 } from "lucide-react";

/**
 * Static illustration of the coach and speaking-feedback screens, used on the
 * marketing site. It is labelled as a preview and uses sample content only.
 */
export function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-label="Product preview with sample content" role="img">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_70%_20%,var(--color-gold-100),transparent_70%),radial-gradient(60%_60%_at_20%_80%,var(--color-navy-100),transparent_70%)]" />
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 font-serif text-sm text-white">C</span>
            <div>
              <p className="text-sm font-semibold text-navy-900">Ordering at a café</p>
              <p className="text-xs text-muted">French · A2 · Balanced corrections</p>
            </div>
          </div>
          <span className="rounded-full bg-gold-50 px-2.5 py-1 text-[0.7rem] font-semibold text-gold-700 ring-1 ring-gold-200">Preview</span>
        </div>
        <div className="space-y-3 bg-canvas/60 px-5 py-5 text-sm">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm ring-1 ring-line">
            <p className="text-ink">Bonjour ! Qu&apos;est-ce que je vous sers ce matin ?</p>
            <p className="mt-1 text-xs text-subtle">Good morning! What can I get you this morning?</p>
          </div>
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-navy-900 px-4 py-2.5 text-white">
            Je veux un café et un croissant, s&apos;il vous plaît.
          </div>
          <div className="ml-auto max-w-[90%] rounded-xl border border-gold-200 bg-gold-50 px-3.5 py-2.5 text-xs text-navy-900">
            <p className="flex items-center gap-1.5 font-semibold text-gold-700">
              <Sparkles className="h-3.5 w-3.5" /> More polite
            </p>
            <p className="mt-1">
              <span className="text-subtle line-through">Je veux</span> → <span className="font-semibold">Je voudrais</span> un café…
            </p>
            <p className="mt-0.5 text-muted">“Je voudrais” sounds natural when ordering; “je veux” can sound abrupt.</p>
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 shadow-sm ring-1 ring-line">
            <p className="text-ink">Très bien. Sur place ou à emporter ?</p>
          </div>
        </div>
      </div>

      <div className="card mt-4 w-[88%] translate-x-[10%] px-5 py-4 sm:w-[80%] sm:translate-x-[22%]">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
            <Mic className="h-3.5 w-3.5 text-navy-700" /> Speaking feedback
          </p>
          <span className="flex items-center gap-1 text-xs text-navy-700">
            <Volume2 className="h-3.5 w-3.5" /> Replay
          </span>
        </div>
        <p className="mt-3 font-serif text-lg leading-relaxed">
          <span className="text-navy-700">Je</span> <span className="text-navy-700">voudrais</span>{" "}
          <span className="rounded bg-danger-50 px-1 text-danger-700 underline decoration-danger-600/40 decoration-2 underline-offset-4">réserver</span>{" "}
          <span className="text-navy-700">une</span> <span className="text-navy-700">table</span>{" "}
          <span className="text-navy-700">pour</span> <span className="text-subtle">deux</span>.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          6 of 7 words recognised. “réserver” was heard as “réservé” — practise the final <em>-er</em> [e].
        </p>
      </div>
    </div>
  );
}
