"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { audioUrl } from "@/components/learning/audio";

export function ImportButtons() {
  const router = useRouter();
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const start = async (publish: boolean) => {
    if (publish && !window.confirm("Publish every changed lesson immediately? Lessons edited in the CMS still go to the review queue.")) return;
    setBusy(publish ? "publish" : "draft");
    setMessage(null);
    try {
      await api("/api/admin/import", { body: { publish } });
      setMessage({ tone: "success", text: "Import started. Refresh in a minute to see the result." });
      setTimeout(() => router.refresh(), 1500);
    } catch (err) {
      setMessage({ tone: "danger", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => start(false)} loading={busy === "draft"} disabled={busy !== null}>
          Import for review
        </Button>
        <Button variant="outline" onClick={() => start(true)} loading={busy === "publish"} disabled={busy !== null}>
          Import and publish
        </Button>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}

export function AudioReviewRow({
  id,
  audioKey,
  verdict,
  note,
}: {
  id: string;
  audioKey: string;
  verdict: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const [playing, setPlaying] = useState<HTMLAudioElement | null>(null);
  const [text, setText] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = () => {
    if (playing) {
      playing.pause();
      setPlaying(null);
      return;
    }
    const a = new Audio(audioUrl(audioKey));
    a.onended = () => setPlaying(null);
    a.play().catch(() => setError("Could not play this file."));
    setPlaying(a);
  };
  const decide = async (v: "APPROVED" | "REJECTED" | null) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/audio/${id}`, { method: "PATCH", body: { verdict: v, note: text || undefined } });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button size="icon" variant="outline" onClick={toggle} aria-label={playing ? "Pause clip" : "Play clip"}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Note (optional)" aria-label="Review note" className="h-9 flex-1 text-sm" maxLength={500} />
      <div className="flex gap-1.5">
        <Button size="sm" variant={verdict === "APPROVED" ? "primary" : "outline"} onClick={() => decide("APPROVED")} disabled={busy}>
          Sounds right
        </Button>
        <Button size="sm" variant={verdict === "REJECTED" ? "danger" : "outline"} onClick={() => decide("REJECTED")} disabled={busy}>
          Reject
        </Button>
        {verdict && (
          <Button size="sm" variant="ghost" onClick={() => decide(null)} disabled={busy}>
            Clear
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-danger-700">{error}</p>}
    </div>
  );
}

export function RoleSelect({ userId, role, disabled }: { userId: string; role: string; disabled?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [error, setError] = useState<string | null>(null);
  const change = async (next: string) => {
    const prev = value;
    setValue(next);
    setError(null);
    try {
      await api(`/api/admin/users/${userId}`, { method: "PATCH", body: { role: next } });
      router.refresh();
    } catch (err) {
      setValue(prev);
      setError((err as Error).message);
    }
  };
  return (
    <div>
      <Select value={value} onChange={(e) => change(e.target.value)} disabled={disabled} aria-label="Role" className="h-9 w-36 text-sm">
        <option value="LEARNER">Learner</option>
        <option value="EDITOR">Editor</option>
        <option value="REVIEWER">Reviewer</option>
        <option value="ADMIN">Admin</option>
      </Select>
      {error && <p className="mt-1 text-xs text-danger-700">{error}</p>}
    </div>
  );
}

interface PlanForm {
  code: string;
  name: string;
  description: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  currency: string;
  stripePriceMonthly: string | null;
  stripePriceYearly: string | null;
  features: string[];
  limits: Record<string, number | boolean | null>;
}

const LIMIT_LABELS: Record<string, string> = {
  lessonsPerDay: "Lessons per day",
  conversationsPerDay: "AI conversations per day",
  messagesPerConversation: "Messages per conversation",
  speakingAttemptsPerDay: "Speaking recordings per day",
  vocabularyReviewsPerDay: "Vocabulary reviews per day",
  freeUnitsOnly: "Free units only",
  premiumReadings: "Premium reading library",
  detailedAnalytics: "Detailed analytics",
  personalizedPractice: "Personalised practice",
};

export function PlanEditor({ plan }: { plan: PlanForm }) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...plan,
    monthly: (plan.priceMonthlyCents / 100).toFixed(2),
    yearly: (plan.priceYearlyCents / 100).toFixed(2),
    featuresText: plan.features.join("\n"),
  });
  const [limits, setLimits] = useState(plan.limits);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/admin/plans/${plan.code}`, {
        method: "PATCH",
        body: {
          name: form.name,
          description: form.description,
          priceMonthlyCents: Math.round(Number(form.monthly) * 100),
          priceYearlyCents: Math.round(Number(form.yearly) * 100),
          currency: form.currency,
          stripePriceMonthly: form.stripePriceMonthly || null,
          stripePriceYearly: form.stripePriceYearly || null,
          features: form.featuresText.split("\n").map((s) => s.trim()).filter(Boolean),
          limits,
        },
      });
      setMessage({ tone: "success", text: "Plan saved." });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "danger", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">{(p) => <Input {...p} value={form.name} onChange={(e) => set("name", e.target.value)} required />}</Field>
        <Field label="Currency" hint="ISO code, e.g. usd, eur">{(p) => <Input {...p} value={form.currency} onChange={(e) => set("currency", e.target.value)} maxLength={3} required />}</Field>
      </div>
      <Field label="Description">{(p) => <Input {...p} value={form.description} onChange={(e) => set("description", e.target.value)} required />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monthly price">{(p) => <Input {...p} type="number" min="0" step="0.01" value={form.monthly} onChange={(e) => set("monthly", e.target.value)} />}</Field>
        <Field label="Yearly price">{(p) => <Input {...p} type="number" min="0" step="0.01" value={form.yearly} onChange={(e) => set("yearly", e.target.value)} />}</Field>
        <Field label="Stripe monthly Price ID" hint="What Stripe actually charges. Must match the price above.">
          {(p) => <Input {...p} value={form.stripePriceMonthly ?? ""} onChange={(e) => set("stripePriceMonthly", e.target.value)} placeholder="price_…" />}
        </Field>
        <Field label="Stripe yearly Price ID">
          {(p) => <Input {...p} value={form.stripePriceYearly ?? ""} onChange={(e) => set("stripePriceYearly", e.target.value)} placeholder="price_…" />}
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-navy-900">Limits</legend>
        <p className="mb-3 text-xs text-muted">Leave a number empty for unlimited.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(limits).map(([k, v]) =>
            typeof v === "boolean" ? (
              <Checkbox key={k} label={LIMIT_LABELS[k] ?? k} checked={v} onChange={(e) => setLimits((l) => ({ ...l, [k]: e.target.checked }))} />
            ) : (
              <Field key={k} label={LIMIT_LABELS[k] ?? k}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min="0"
                    value={v ?? ""}
                    placeholder="Unlimited"
                    onChange={(e) => setLimits((l) => ({ ...l, [k]: e.target.value === "" ? null : Number(e.target.value) }))}
                  />
                )}
              </Field>
            ),
          )}
        </div>
      </fieldset>
      <Field label="Features (one per line)" hint="Shown on the pricing page.">
        {(p) => <Textarea {...p} value={form.featuresText} onChange={(e) => set("featuresText", e.target.value)} />}
      </Field>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" loading={busy}>
        Save plan
      </Button>
    </form>
  );
}

export function VocabularyEditor({
  item,
}: {
  item: { id: string; term: string; translation: string; ipa: string | null; usageNote: string | null; example: string; exampleTranslation: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ translation: item.translation, ipa: item.ipa ?? "", usageNote: item.usageNote ?? "", example: item.example, exampleTranslation: item.exampleTranslation ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/vocabulary/${item.id}`, {
        method: "PATCH",
        body: { translation: form.translation, ipa: form.ipa || null, usageNote: form.usageNote || null, example: form.example, exampleTranslation: form.exampleTranslation || null },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="mt-2 grid gap-3 rounded-xl border border-line bg-canvas p-3 sm:grid-cols-2">
      <Field label="Translation">{(p) => <Input {...p} value={form.translation} onChange={(e) => setForm({ ...form, translation: e.target.value })} required />}</Field>
      <Field label="IPA" hint="Editor IPA replaces the automatic transcription.">
        {(p) => <Input {...p} value={form.ipa} onChange={(e) => setForm({ ...form, ipa: e.target.value })} />}
      </Field>
      <Field label="Example">{(p) => <Input {...p} value={form.example} onChange={(e) => setForm({ ...form, example: e.target.value })} required />}</Field>
      <Field label="Example translation">{(p) => <Input {...p} value={form.exampleTranslation} onChange={(e) => setForm({ ...form, exampleTranslation: e.target.value })} />}</Field>
      <Field label="Usage note" className="sm:col-span-2">{(p) => <Textarea {...p} value={form.usageNote} onChange={(e) => setForm({ ...form, usageNote: e.target.value })} className="min-h-[4rem]" />}</Field>
      {error && <p className="text-sm text-danger-700 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" loading={busy}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
