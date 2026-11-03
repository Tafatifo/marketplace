"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

/** Lets learners change the level they are working at; available levels are those with published courses. */
export function LevelSwitcher({ language, current, levels }: { language: string; current: string; levels: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const change = async (level: string) => {
    if (level === current) return;
    setBusy(level);
    try {
      await api("/api/enrollment", { body: { language, level, activate: true } });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };
  return (
    <div role="radiogroup" aria-label="Course level" className="inline-flex rounded-xl border border-line bg-white p-1">
      {["A1", "A2", "B1", "B2"].map((l) => {
        const available = levels.includes(l);
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={l === current}
            disabled={!available || busy !== null}
            onClick={() => change(l)}
            title={available ? `Work at level ${l}` : `${l} is in preparation`}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
              l === current ? "bg-navy-900 text-white" : available ? "text-navy-800 hover:bg-navy-50" : "cursor-not-allowed text-subtle/60",
              busy === l && "opacity-60",
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
