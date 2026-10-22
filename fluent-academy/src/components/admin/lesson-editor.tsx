"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, TriangleAlert } from "lucide-react";
import { Tabs } from "radix-ui";
import { LessonBlockView } from "@/components/learning/blocks";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/primitives";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { LessonBlock } from "@/content/types";
import { LINGUISTIC_OPTIONS } from "./badges";

interface Issue {
  severity: "error" | "warning";
  where: string;
  message: string;
}

function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="space-y-1.5 text-sm" aria-label="Validation results">
      {issues.map((i, n) => (
        <li key={n} className="flex items-start gap-2">
          {i.severity === "error" ? (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" aria-label="Error" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" aria-label="Warning" />
          )}
          <span>
            <code className="rounded bg-canvas px-1 text-xs">{i.where || "lesson"}</code> {i.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** JSON editor for a lesson snapshot with server-side validation (same rules as content QA). */
export function LessonJsonEditor({ slug, initial, canEdit }: { slug: string; initial: unknown; canEdit: boolean }) {
  const router = useRouter();
  const initialText = useMemo(() => JSON.stringify(initial, null, 2), [initial]);
  const [text, setText] = useState(initialText);
  const [note, setNote] = useState("");
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [state, setState] = useState<"idle" | "validating" | "saving">("idle");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const dirty = text !== initialText;

  const parse = (): unknown | null => {
    try {
      return JSON.parse(text);
    } catch (err) {
      setIssues([{ severity: "error", where: "JSON", message: (err as Error).message }]);
      return null;
    }
  };

  const validate = async () => {
    setMessage(null);
    const snapshot = parse();
    if (snapshot === null) return;
    setState("validating");
    try {
      const res = await api<{ ok: boolean; issues: Issue[] }>(`/api/admin/lessons/${slug}/validate`, { body: { snapshot } });
      setIssues(res.issues);
      setMessage(res.ok ? { tone: "success", text: res.issues.length ? "Valid, with warnings." : "Valid." } : { tone: "danger", text: "The lesson has errors." });
    } catch (err) {
      setMessage({ tone: "danger", text: (err as Error).message });
    } finally {
      setState("idle");
    }
  };

  const save = async () => {
    setMessage(null);
    const snapshot = parse();
    if (snapshot === null) return;
    setState("saving");
    try {
      const res = await api<{ revision: { version: number }; warnings: Issue[] }>(`/api/admin/lessons/${slug}/revisions`, { body: { snapshot, note: note || undefined } });
      setIssues(res.warnings);
      setMessage({ tone: "success", text: `Saved as draft revision v${res.revision.version}. Submit it for review in the Revisions tab.` });
      setNote("");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) setIssues(err.details as Issue[]);
      setMessage({ tone: "danger", text: (err as Error).message });
    } finally {
      setState("idle");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        The full lesson as JSON: metadata, instructional blocks and exercises (including answer keys). Exercise <code>key</code>s are stable identifiers —
        keep them when editing so learners&apos; history stays attached. Saving creates a draft; nothing changes for learners until a revision is approved and published.
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!canEdit}
        spellCheck={false}
        aria-label="Lesson JSON"
        className="min-h-[32rem] font-mono text-[0.8rem] leading-5"
      />
      {issues && issues.length > 0 && <IssueList issues={issues} />}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {canEdit ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Change note" className="flex-1" hint="What changed and why — reviewers see this.">
            {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Fixed agreement in exercise 4; added a mistake note" />}
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" onClick={validate} loading={state === "validating"} disabled={state !== "idle"}>
              Validate
            </Button>
            <Button onClick={save} loading={state === "saving"} disabled={state !== "idle" || !dirty}>
              Save draft
            </Button>
          </div>
        </div>
      ) : (
        <Alert>Your role can review but not edit lessons.</Alert>
      )}
    </div>
  );
}

export interface RevisionRow {
  id: string;
  version: number;
  status: string;
  source: string;
  note: string | null;
  reviewComment?: string | null;
  author: string | null;
  authorId: string | null;
  reviewer: string | null;
  createdAt: string;
  publishedAt: string | null;
}

const ACTIONS: Record<string, { action: "submit" | "approve" | "reject" | "publish"; label: string; roles: string[]; variant: "primary" | "outline" | "danger" }[]> = {
  DRAFT: [{ action: "submit", label: "Submit for review", roles: ["EDITOR"], variant: "primary" }],
  IN_REVIEW: [
    { action: "approve", label: "Approve", roles: ["REVIEWER"], variant: "primary" },
    { action: "reject", label: "Request changes", roles: ["REVIEWER"], variant: "outline" },
  ],
  APPROVED: [
    { action: "publish", label: "Publish", roles: ["EDITOR"], variant: "primary" },
    { action: "reject", label: "Send back", roles: ["REVIEWER"], variant: "outline" },
  ],
};

export function RevisionActions({ revision, role, userId }: { revision: RevisionRow; role: string; userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const actions = (ACTIONS[revision.status] ?? []).filter((a) => role === "ADMIN" || a.roles.includes(role));
  if (!actions.length) return null;
  const run = async (action: string) => {
    setBusy(action);
    setError(null);
    try {
      await api(`/api/admin/revisions/${revision.id}`, { method: "PATCH", body: { action, comment: comment || undefined } });
      setComment("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const ownApproval = revision.status === "IN_REVIEW" && revision.authorId === userId && role !== "ADMIN";
  return (
    <div className="mt-3 space-y-2">
      {revision.status !== "DRAFT" && (
        <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" maxLength={500} aria-label="Review comment" className="h-9 text-sm" />
      )}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant={a.variant}
            loading={busy === a.action}
            disabled={busy !== null || (a.action === "approve" && ownApproval)}
            title={a.action === "approve" && ownApproval ? "Someone else must approve your revision" : undefined}
            onClick={() => run(a.action)}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-danger-700">{error}</p>}
    </div>
  );
}

export function LinguisticReviewForm({ entityType, entityId, current }: { entityType: "LESSON" | "PASSAGE"; entityId: string; current: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(current === "AI_DRAFTED" ? "NATIVE_REVIEWED" : current);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/admin/reviews", { body: { entityType, entityId, status, comment } });
      setComment("");
      setMessage({ tone: "success", text: "Review recorded." });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "danger", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Verdict">
        {(p) => (
          <Select {...p} value={status} onChange={(e) => setStatus(e.target.value)}>
            {LINGUISTIC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} — {o.hint}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="What you checked" hint="Required. Note corrections, regional usage, or anything that should change.">
        {(p) => <Textarea {...p} value={comment} onChange={(e) => setComment(e.target.value)} required minLength={3} maxLength={2000} />}
      </Field>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" loading={busy}>
        Record review
      </Button>
    </form>
  );
}

export function LessonPreview({ blocks, language, lessonId }: { blocks: LessonBlock[]; language: string; lessonId: string }) {
  const saved = useMemo(() => new Set<string>(), []);
  return (
    <div className="space-y-6">
      {blocks.map((b, i) => (
        <LessonBlockView key={i} block={b} language={language} lessonId={lessonId} savedTerms={saved} />
      ))}
    </div>
  );
}

export function LessonTabs({ tabs }: { tabs: { value: string; label: string; count?: number; content: React.ReactNode }[] }) {
  return (
    <Tabs.Root defaultValue={tabs[0]?.value}>
      <Tabs.List className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Lesson sections">
        {tabs.map((t) => (
          <Tabs.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              "-mb-px shrink-0 border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-muted",
              "hover:text-navy-900 data-[state=active]:border-navy-900 data-[state=active]:text-navy-900",
            )}
          >
            {t.label}
            {t.count !== undefined && <Badge tone="neutral" className="ml-1.5">{t.count}</Badge>}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.map((t) => (
        <Tabs.Content key={t.value} value={t.value} className="focus-visible:outline-none">
          {t.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

export function ValidState({ errors, warnings }: { errors: number; warnings: number }) {
  if (errors) return <Badge tone="danger"><CircleAlert className="h-3 w-3" aria-hidden /> {errors} QA errors</Badge>;
  if (warnings) return <Badge tone="warning"><TriangleAlert className="h-3 w-3" aria-hidden /> {warnings} QA warnings</Badge>;
  return <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden /> Passes QA</Badge>;
}
