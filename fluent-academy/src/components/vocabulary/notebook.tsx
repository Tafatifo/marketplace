"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, EmptyState } from "@/components/ui/primitives";
import { AudioButton } from "@/components/learning/audio";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";

export interface NotebookWord {
  id: string;
  term: string;
  translation: string;
  example: string | null;
  notes: string | null;
  status: string;
  sourceType: string;
  sourceContext: string | null;
  dueAt: string;
  intervalDays: number;
  audioKey: string | null;
  reviews: number;
  correctRate: number | null;
}

const STATUS_TONE: Record<string, "navy" | "gold" | "success" | "neutral" | "warning"> = { NEW: "gold", LEARNING: "warning", REVIEW: "navy", MASTERED: "success", SUSPENDED: "neutral" };
const SOURCE: Record<string, string> = { LESSON: "Lesson", READING: "Reading", CONVERSATION: "Coach", MANUAL: "Added by you", SPEAKING: "Speaking" };

export function Notebook({ words, language }: { words: NotebookWord[]; language: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ term: "", translation: "", example: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return words.filter((w) => (status === "all" || w.status === status) && (!n || w.term.toLowerCase().includes(n) || w.translation.toLowerCase().includes(n)));
  }, [words, q, status]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/vocabulary", { body: { language, term: form.term, translation: form.translation, example: form.example || undefined, notes: form.notes || undefined, sourceType: "MANUAL" } });
      setForm({ term: "", translation: "", example: "", notes: "" });
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the word.");
    } finally {
      setBusy(false);
    }
  };
  const patch = async (id: string, body: Record<string, unknown>) => {
    await api(`/api/vocabulary/${id}`, { method: "PATCH", body });
    router.refresh();
  };
  const remove = async (id: string) => {
    await api(`/api/vocabulary/${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="card">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
          <label htmlFor="vocab-search" className="sr-only">Search words</label>
          <Input id="vocab-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your words" className="pl-9" />
        </div>
        <label htmlFor="vocab-status" className="sr-only">Filter by status</label>
        <Select id="vocab-status" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44">
          <option value="all">All words</option>
          <option value="NEW">New</option>
          <option value="LEARNING">Learning</option>
          <option value="REVIEW">Reviewing</option>
          <option value="MASTERED">Mastered</option>
          <option value="SUSPENDED">Paused</option>
        </Select>
        <Button onClick={() => setAdding((a) => !a)} variant={adding ? "secondary" : "primary"}>
          <Plus className="h-4 w-4" /> Add word
        </Button>
      </div>
      {adding && (
        <form
          className="grid gap-4 border-b border-line bg-canvas/60 px-5 py-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Field label="Word or phrase">{(p) => <Input {...p} required lang={language} value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />}</Field>
          <Field label="Meaning">{(p) => <Input {...p} required value={form.translation} onChange={(e) => setForm({ ...form, translation: e.target.value })} />}</Field>
          <Field label="Example sentence (optional)" className="sm:col-span-2">{(p) => <Input {...p} lang={language} value={form.example} onChange={(e) => setForm({ ...form, example: e.target.value })} />}</Field>
          <Field label="Notes (optional)" className="sm:col-span-2">{(p) => <Textarea {...p} className="min-h-[4rem]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
          {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!form.term.trim() || !form.translation.trim()}>Save word</Button>
          </div>
        </form>
      )}
      {words.length === 0 ? (
        <EmptyState className="m-5" title="Your notebook is empty" description="Tap the bookmark next to any word in a lesson, reading or coach conversation to save it here. You can also add words yourself." />
      ) : list.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">No words match your search.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((w) => (
            <li key={w.id} className="px-5 py-3.5">
              <div className="flex items-center gap-3">
                <AudioButton audio={w.audioKey ? { key: w.audioKey } : null} text={w.term} lang={language} size="sm" showSlow={false} />
                <button type="button" onClick={() => setOpen(open === w.id ? null : w.id)} className="min-w-0 flex-1 text-left" aria-expanded={open === w.id}>
                  <p className="truncate">
                    <span className="font-medium text-navy-900" lang={language}>{w.term}</span> <span className="text-muted">— {w.translation}</span>
                  </p>
                  <p className="text-xs text-subtle">{SOURCE[w.sourceType] ?? w.sourceType} · {w.status === "SUSPENDED" ? "paused" : new Date(w.dueAt) <= new Date() ? "due now" : `next review ${formatDate(w.dueAt, { day: "numeric", month: "short" })}`}{w.correctRate !== null ? ` · ${Math.round(w.correctRate * 100)}% correct in ${w.reviews} review${w.reviews === 1 ? "" : "s"}` : ""}</p>
                </button>
                <Badge tone={STATUS_TONE[w.status] ?? "neutral"}>{w.status === "REVIEW" ? "Reviewing" : w.status === "SUSPENDED" ? "Paused" : w.status.charAt(0) + w.status.slice(1).toLowerCase()}</Badge>
              </div>
              {open === w.id && (
                <div className="mt-3 ml-10 space-y-2 rounded-xl bg-canvas px-4 py-3 text-sm">
                  {w.example && <p className="text-navy-800 italic" lang={language}>{w.example}</p>}
                  {w.sourceContext && w.sourceContext !== w.example && <p className="text-muted">Context: <span lang={language}>{w.sourceContext}</span></p>}
                  {w.notes && <p className="text-ink">Notes: {w.notes}</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => patch(w.id, { suspended: w.status !== "SUSPENDED" })}><Ban className="h-3.5 w-3.5" /> {w.status === "SUSPENDED" ? "Resume reviews" : "Pause reviews"}</Button>
                    <Button size="sm" variant="outline" onClick={() => patch(w.id, { reset: true })}><RotateCcw className="h-3.5 w-3.5" /> Relearn</Button>
                    <Button size="sm" variant="ghost" className="text-danger-600 hover:bg-danger-50" onClick={() => remove(w.id)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
