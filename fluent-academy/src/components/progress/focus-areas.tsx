"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";

export interface FocusArea {
  id: string;
  category: string;
  label: string;
  skill: string;
  status: "EMERGING" | "ACTIVE" | "IMPROVING" | "RESOLVED" | "DISMISSED";
  errorCount: number;
  successCount: number;
  distinctItems: number;
  streakCorrect: number;
  lastSeenAt: string;
  examples: { evidence: string | null; detail: string | null; at: string }[];
}

const TONE = { ACTIVE: "danger", EMERGING: "warning", IMPROVING: "navy", RESOLVED: "success", DISMISSED: "neutral" } as const;
const LABEL = { ACTIVE: "Focus area", EMERGING: "Watching", IMPROVING: "Improving", RESOLVED: "Resolved", DISMISSED: "Dismissed" };

export function FocusAreas({ items, language }: { items: FocusArea[]; language: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (id: string, dismissed: boolean) => {
    setBusy(id);
    await api(`/api/weaknesses/${id}`, { method: "PATCH", body: { dismissed } }).catch(() => {});
    setBusy(null);
    router.refresh();
  };
  if (!items.length) return <p className="text-sm text-muted">No patterns yet. Repeated errors on the same point will appear here, with the evidence behind them.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((w) => (
        <li key={w.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-navy-900">{w.label}</p>
              <p className="mt-0.5 text-xs text-muted">
                {w.errorCount} error{w.errorCount === 1 ? "" : "s"} on {w.distinctItems} item{w.distinctItems === 1 ? "" : "s"} · {w.successCount} correct · last seen {timeAgo(w.lastSeenAt)}
                {w.streakCorrect > 0 ? ` · ${w.streakCorrect} correct in a row` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={TONE[w.status]}>{LABEL[w.status]}</Badge>
              {w.status === "DISMISSED" ? (
                <Button size="sm" variant="ghost" onClick={() => toggle(w.id, false)} loading={busy === w.id}>Restore</Button>
              ) : w.status !== "RESOLVED" ? (
                <Button size="sm" variant="ghost" onClick={() => toggle(w.id, true)} loading={busy === w.id} title="Tell us this isn't a real difficulty (for example, a typo or a misheard recording)">Not accurate</Button>
              ) : null}
            </div>
          </div>
          {w.examples.length > 0 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-navy-700">Show evidence</summary>
              <ul className="mt-2 space-y-1 rounded-lg bg-canvas px-3 py-2">
                {w.examples.map((e, i) => (
                  <li key={i} className="text-ink">
                    {e.evidence && <span lang={language}>{e.evidence}</span>}
                    {e.detail && <span className="text-muted"> — {e.detail}</span>}
                    <span className="text-xs text-subtle"> · {timeAgo(e.at)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
