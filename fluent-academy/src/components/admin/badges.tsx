import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const CONTENT: Record<string, { label: string; tone: ComponentProps<typeof Badge>["tone"] }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  IN_REVIEW: { label: "In review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "navy" },
  PUBLISHED: { label: "Published", tone: "success" },
  ARCHIVED: { label: "Archived", tone: "outline" },
};

const LINGUISTIC: Record<string, { label: string; tone: ComponentProps<typeof Badge>["tone"]; hint: string }> = {
  AI_DRAFTED: { label: "Not yet reviewed", tone: "outline", hint: "Drafted with AI assistance; no native-speaker review recorded" },
  NEEDS_CHANGES: { label: "Needs changes", tone: "danger", hint: "A reviewer asked for corrections" },
  NATIVE_REVIEWED: { label: "Native reviewed", tone: "navy", hint: "Checked by a native or expert speaker" },
  APPROVED: { label: "Linguistically approved", tone: "success", hint: "Reviewed and signed off" },
};

const QA: Record<string, ComponentProps<typeof Badge>["tone"]> = { PASS: "success", REVIEW: "warning", FAIL: "danger", UNCHECKED: "outline" };

export function ContentStatusBadge({ status }: { status: string }) {
  const s = CONTENT[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function LinguisticBadge({ status }: { status: string }) {
  const s = LINGUISTIC[status] ?? { label: status, tone: "neutral" as const, hint: "" };
  return (
    <Badge tone={s.tone} title={s.hint}>
      {s.label}
    </Badge>
  );
}

export function QaBadge({ status, verdict }: { status: string; verdict?: string | null }) {
  if (verdict) return <Badge tone={verdict === "APPROVED" ? "success" : "danger"}>{verdict === "APPROVED" ? "Approved by ear" : "Rejected by ear"}</Badge>;
  return <Badge tone={QA[status] ?? "neutral"}>{status === "UNCHECKED" ? "Unchecked" : status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export const LINGUISTIC_OPTIONS = Object.entries(LINGUISTIC).map(([value, v]) => ({ value, label: v.label, hint: v.hint }));

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white", className)}>
      <table className="w-full min-w-[640px] text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-muted [&_th]:uppercase [&_thead]:border-b [&_thead]:border-line [&_thead]:bg-canvas [&_tbody_tr]:border-b [&_tbody_tr]:border-line/70 [&_tbody_tr:last-child]:border-0">
        {children}
      </table>
    </div>
  );
}

export function StateDot({ state }: { state: "ok" | "fallback" | "down" | "off" }) {
  const color = { ok: "bg-success-600", fallback: "bg-warning-600", down: "bg-danger-600", off: "bg-navy-200" }[state];
  const label = { ok: "Live", fallback: "Fallback", down: "Down", off: "Off" }[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
      <span className={cn("h-2 w-2 rounded-full", color)} aria-hidden />
      {label}
    </span>
  );
}
