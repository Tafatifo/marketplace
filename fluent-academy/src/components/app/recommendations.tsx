"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BookOpenText, ClipboardCheck, Compass, Dumbbell, GraduationCap, Headphones, Info, MessagesSquare, Mic, RotateCcw, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Recommendation } from "@/server/recommendations";

const ICONS = {
  lesson: GraduationCap,
  review: RotateCcw,
  practice: Dumbbell,
  reading: BookOpenText,
  listening: Headphones,
  coach: MessagesSquare,
  speaking: Mic,
  placement: Compass,
  assessment: ClipboardCheck,
};

export function RecommendationList({ items }: { items: Recommendation[] }) {
  const [list, setList] = useState(items);
  const dismiss = async (key: string) => {
    setList((l) => l.filter((r) => r.key !== key));
    await api("/api/recommendations/dismiss", { body: { key } }).catch(() => {});
  };
  if (!list.length) return <p className="px-6 py-6 text-sm text-muted">You&apos;re all caught up. Pick any activity from the menu.</p>;
  return (
    <ul className="divide-y divide-line">
      {list.map((r) => {
        const Icon = ICONS[r.kind] ?? GraduationCap;
        return (
          <li key={r.key} className="group relative flex items-start gap-4 px-6 py-4 transition-colors hover:bg-navy-50/40">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><Icon className="h-4 w-4" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <Link href={r.href} className="font-medium text-navy-900 after:absolute after:inset-0 hover:underline">{r.title}</Link>
              <p className="mt-0.5 text-sm text-muted">{r.description}</p>
              <p className="mt-1 flex items-start gap-1.5 text-xs text-subtle"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /><span><span className="sr-only">Why: </span>{r.reason}</span></p>
            </div>
            <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
            {r.dismissible && (
              <button type="button" onClick={() => dismiss(r.key)} className="relative z-10 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-subtle opacity-70 hover:bg-white hover:text-navy-900 hover:opacity-100" aria-label={`Dismiss recommendation: ${r.title}`} title="Not useful — hide for a week">
                <X className="h-4 w-4" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
