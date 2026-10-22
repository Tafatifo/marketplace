import Link from "next/link";
import { CheckCircle2, Clock, Lock } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/primitives";

export interface LibraryItem {
  slug: string;
  title: string;
  summary: string;
  level: string;
  topic: string;
  minutes: number;
  words: number;
  completed: boolean;
  locked: boolean;
}

export function LevelFilter({ base, current, levels, q }: { base: string; current: string; levels: string[]; q?: string }) {
  return (
    <nav aria-label="Filter by level" className="flex flex-wrap gap-2">
      {["all", ...levels].map((l) => (
        <Link
          key={l}
          href={`${base}?level=${l}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          aria-current={current === l ? "page" : undefined}
          className={current === l ? "rounded-full bg-navy-900 px-3.5 py-1.5 text-sm font-medium text-white" : "rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-navy-800 ring-1 ring-line hover:bg-navy-50"}
        >
          {l === "all" ? "All levels" : l}
        </Link>
      ))}
    </nav>
  );
}

export function LibraryGrid({ items, base, emptyText }: { items: LibraryItem[]; base: string; emptyText: string }) {
  if (!items.length) return <EmptyState title="Nothing here yet" description={emptyText} />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((p) => (
        <li key={p.slug}>
          <Link href={`${base}/${p.slug}`} className="card flex h-full flex-col p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
            <div className="flex items-center justify-between gap-2">
              <Badge tone="navy">{p.level}</Badge>
              <span className="flex items-center gap-2 text-xs text-muted">
                {p.locked && <Lock className="h-3.5 w-3.5" aria-label="Premium" />}
                {p.completed && <CheckCircle2 className="h-4 w-4 text-success-600" aria-label="Completed" />}
                <Clock className="h-3.5 w-3.5" /> {p.minutes} min
              </span>
            </div>
            <h3 className="mt-3 font-serif text-lg font-semibold text-navy-900">{p.title}</h3>
            <p className="mt-1 flex-1 text-sm text-muted">{p.summary}</p>
            <p className="mt-3 text-xs text-subtle">{p.topic} · {p.words} words</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
