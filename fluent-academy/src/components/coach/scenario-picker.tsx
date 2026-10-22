"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

export interface ScenarioCard {
  slug: string;
  title: string;
  description: string;
  category: string;
  minLevel: string;
  maxLevel: string;
  fits: boolean;
  locked: boolean;
  isFree: boolean;
  goals: string[];
}

const MODES = [
  { id: "GENTLE", label: "Gentle", description: "Conversation first — only important errors." },
  { id: "BALANCED", label: "Balanced", description: "Natural conversation with useful corrections." },
  { id: "INTENSIVE", label: "Intensive", description: "Detailed grammar and vocabulary corrections." },
] as const;

const CATEGORIES: Record<string, string> = { social: "Social", travel: "Travel", daily: "Everyday life", work: "Work", opinion: "Opinions" };

export function ScenarioPicker({
  scenarios,
  defaultMode,
  preselect,
  passageSlug,
}: {
  scenarios: ScenarioCard[];
  defaultMode: "GENTLE" | "BALANCED" | "INTENSIVE";
  preselect?: string;
  passageSlug?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(defaultMode);
  const [selected, setSelected] = useState<string | null>(preselect ?? (passageSlug ? scenarios.find((s) => s.slug === "expressing-opinion" && !s.locked)?.slug ?? null : null));
  const [filter, setFilter] = useState<string>("fits");
  const [error, setError] = useState<{ msg: string; upgrade?: boolean } | null>(null);
  const [starting, setStarting] = useState(false);
  const list = useMemo(() => scenarios.filter((s) => (filter === "fits" ? s.fits : filter === "all" ? true : s.category === filter)), [scenarios, filter]);

  const start = async () => {
    if (!selected) return;
    setStarting(true);
    setError(null);
    try {
      const res = await api<{ id: string }>("/api/coach/conversations", { body: { scenarioSlug: selected, correctionMode: mode, passageSlug } });
      router.push(`/coach/${res.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? { msg: err.message, upgrade: err.status === 402 } : { msg: "Couldn't start the conversation." });
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter scenarios">
        {[["fits", "For your level"], ["all", "All"], ...Object.entries(CATEGORIES)].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id!)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors", filter === id ? "bg-navy-900 text-white" : "bg-white text-navy-800 ring-1 ring-line hover:bg-navy-50")}>
            {label}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Scenario" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((s) => (
          <button
            key={s.slug}
            type="button"
            role="radio"
            aria-checked={selected === s.slug}
            disabled={s.locked}
            onClick={() => setSelected(s.slug)}
            className={cn(
              "card flex flex-col p-5 text-left transition-[box-shadow,border-color]",
              selected === s.slug ? "border-navy-700 shadow-[0_0_0_3px_var(--color-navy-100)]" : "hover:border-navy-200",
              s.locked && "opacity-60",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <Badge tone="neutral">{CATEGORIES[s.category] ?? s.category}</Badge>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                {s.locked && <Lock className="h-3 w-3" />}
                {s.minLevel}–{s.maxLevel}
              </span>
            </div>
            <h3 className="mt-3 font-semibold text-navy-900">{s.title}</h3>
            <p className="mt-1 flex-1 text-sm text-muted">{s.description}</p>
            {!s.fits && <p className="mt-2 text-xs text-gold-700">Outside your current level</p>}
          </button>
        ))}
        {list.length === 0 && <p className="text-sm text-muted">No scenarios in this filter.</p>}
      </div>

      <div className="card flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
        <fieldset>
          <legend className="text-sm font-semibold text-navy-900">Correction mode</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <label key={m.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors", mode === m.id ? "border-navy-700 bg-navy-50/50" : "border-line hover:border-navy-200")}>
                <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} className="mt-0.5 accent-navy-800" />
                <span>
                  <span className="font-medium text-navy-900">{m.label}</span>
                  <span className="block text-xs text-muted">{m.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button size="lg" onClick={start} disabled={!selected} loading={starting} className="shrink-0">
          Start conversation <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      {error && (
        <Alert tone={error.upgrade ? "warning" : "danger"}>
          {error.msg} {error.upgrade && <a href="/billing" className="font-semibold underline">See Premium</a>}
        </Alert>
      )}
    </div>
  );
}
