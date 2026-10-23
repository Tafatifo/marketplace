"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { DAILY_GOALS, FOCUS_AREAS, NATIVE_LANGUAGES } from "@/lib/languages";

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-6">
      <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function useSaver() {
  const [status, setStatus] = useState<{ tone: "success" | "danger"; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok = "Saved.") => {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      setStatus({ tone: "success", msg: ok });
    } catch (err) {
      setStatus({ tone: "danger", msg: err instanceof ApiError ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };
  return { status, busy, run };
}

export interface SettingsData {
  name: string;
  email: string;
  nativeLanguage: string;
  explainInNative: boolean;
  correctionMode: string;
  dailyGoalMinutes: number;
  focusAreas: string[];
  timezone: string;
  retainRecordings: boolean;
  recordingRetentionDays: number;
  maxRetentionDays: number;
  recordingsStored: number;
  conversations: number;
}

export function SettingsForms({ data }: { data: SettingsData }) {
  const router = useRouter();
  const [name, setName] = useState(data.name);
  const [prefs, setPrefs] = useState({
    nativeLanguage: data.nativeLanguage,
    explainInNative: data.explainInNative,
    correctionMode: data.correctionMode,
    dailyGoalMinutes: data.dailyGoalMinutes,
    focusAreas: data.focusAreas,
    timezone: data.timezone,
  });
  const [privacy, setPrivacy] = useState({ retainRecordings: data.retainRecordings, recordingRetentionDays: data.recordingRetentionDays });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [del, setDel] = useState({ password: "", confirm: "" });
  const profile = useSaver();
  const learning = useSaver();
  const password = useSaver();
  const priv = useSaver();
  const danger = useSaver();

  return (
    <div className="space-y-6">
      <Section title="Profile">
        <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void profile.run(() => api("/api/settings/profile", { method: "PATCH", body: { name } }).then(() => router.refresh())); }}>
          <Field label="Name" className="flex-1">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Email" className="flex-1" hint="Contact support to change your email.">{(p) => <Input {...p} value={data.email} disabled />}</Field>
          <Button type="submit" loading={profile.busy}>Save</Button>
        </form>
        {profile.status && <Alert tone={profile.status.tone} className="mt-4">{profile.status.msg}</Alert>}
      </Section>

      <Section title="Learning preferences" description="These shape your lessons, coach conversations and daily goal.">
        <form className="grid gap-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void learning.run(() => api("/api/settings/preferences", { method: "PATCH", body: prefs }).then(() => router.refresh())); }}>
          <Field label="Native language">{(p) => (
            <Select {...p} value={prefs.nativeLanguage} onChange={(e) => setPrefs({ ...prefs, nativeLanguage: e.target.value })}>
              {NATIVE_LANGUAGES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </Select>
          )}</Field>
          <Field label="Default correction mode">{(p) => (
            <Select {...p} value={prefs.correctionMode} onChange={(e) => setPrefs({ ...prefs, correctionMode: e.target.value })}>
              <option value="GENTLE">Gentle — important errors only</option>
              <option value="BALANCED">Balanced</option>
              <option value="INTENSIVE">Intensive — detailed corrections</option>
            </Select>
          )}</Field>
          <Field label="Daily goal">{(p) => (
            <Select {...p} value={prefs.dailyGoalMinutes} onChange={(e) => setPrefs({ ...prefs, dailyGoalMinutes: Number(e.target.value) })}>
              {DAILY_GOALS.map((g) => <option key={g.minutes} value={g.minutes}>{g.label} — {g.minutes} min / {g.xp} XP</option>)}
            </Select>
          )}</Field>
          <Field label="Time zone" hint="Used for streaks and daily limits.">{(p) => <Input {...p} value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })} />}</Field>
          <div className="sm:col-span-2">
            <Checkbox label="Explain coach corrections in my native language" checked={prefs.explainInNative} onChange={(e) => setPrefs({ ...prefs, explainInNative: e.target.checked })} />
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium text-navy-900">Areas I find difficult</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {FOCUS_AREAS.map(([c, l]) => (
                <Checkbox key={c} label={l} checked={prefs.focusAreas.includes(c)} onChange={(e) => setPrefs({ ...prefs, focusAreas: e.target.checked ? [...prefs.focusAreas, c] : prefs.focusAreas.filter((x) => x !== c) })} />
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={learning.busy}>Save preferences</Button></div>
        </form>
        {learning.status && <Alert tone={learning.status.tone} className="mt-4">{learning.status.msg}</Alert>}
      </Section>

      <Section title="Password" description="Changing your password signs you out on other devices.">
        <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void password.run(() => api("/api/settings/password", { body: pw }).then(() => setPw({ current: "", next: "" })), "Password changed. Other devices have been signed out."); }}>
          <Field label="Current password" className="flex-1">{(p) => <Input {...p} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}</Field>
          <Field label="New password" className="flex-1" hint="At least 10 characters.">{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}</Field>
          <Button type="submit" loading={password.busy} disabled={!pw.current || !pw.next}>Change</Button>
        </form>
        {password.status && <Alert tone={password.status.tone} className="mt-4">{password.status.msg}</Alert>}
      </Section>

      <Section id="privacy" title="Data & privacy" description="You control how long your voice recordings and conversations are kept.">
        <div className="space-y-5">
          <form className="grid gap-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); void priv.run(() => api("/api/settings/preferences", { method: "PATCH", body: privacy }).then(() => router.refresh())); }}>
            <div className="pb-2.5">
              <Checkbox
                label={<><span className="font-medium">Keep my recordings</span> so I can replay them. When off, recordings are analysed and immediately discarded (existing recordings are deleted).</>}
                checked={privacy.retainRecordings}
                onChange={(e) => setPrivacy({ ...privacy, retainRecordings: e.target.checked })}
              />
            </div>
            <Field label="Delete recordings after">{(p) => (
              <Select {...p} value={privacy.recordingRetentionDays} disabled={!privacy.retainRecordings} onChange={(e) => setPrivacy({ ...privacy, recordingRetentionDays: Number(e.target.value) })}>
                {[1, 7, 14, 30, 90].filter((d) => d <= data.maxRetentionDays).map((d) => <option key={d} value={d}>{d} day{d === 1 ? "" : "s"}</option>)}
              </Select>
            )}</Field>
            <Button type="submit" loading={priv.busy}>Save</Button>
          </form>
          <div className="flex flex-wrap gap-3 border-t border-line pt-5">
            <Button variant="outline" onClick={() => priv.run(() => api("/api/settings/delete-recordings", { method: "POST" }).then(() => router.refresh()), "All recordings deleted.")} disabled={!data.recordingsStored}>
              <Trash2 className="h-4 w-4" /> Delete all recordings ({data.recordingsStored})
            </Button>
            <Button variant="outline" onClick={() => priv.run(() => api("/api/settings/delete-conversations", { method: "POST" }).then(() => router.refresh()), "Conversation history deleted.")} disabled={!data.conversations}>
              <Trash2 className="h-4 w-4" /> Delete conversation history ({data.conversations})
            </Button>
            <a href="/api/settings/export" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-navy-900 hover:bg-navy-50"><Download className="h-4 w-4" /> Export my data (JSON)</a>
          </div>
          {priv.status && <Alert tone={priv.status.tone}>{priv.status.msg}</Alert>}
        </div>
      </Section>

      <Section title="Delete account" description="This permanently deletes your account and all learning records. It can't be undone.">
        <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void danger.run(async () => { await api("/api/settings/delete-account", { body: del }); // Full reload so no signed-in state survives in memory.
          window.location.assign(new URL("/", window.location.origin).href); }); }}>
          <Field label="Password" className="flex-1">{(p) => <Input {...p} type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />}</Field>
          <Field label='Type "DELETE" to confirm' className="flex-1">{(p) => <Input {...p} value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} />}</Field>
          <Button type="submit" variant="danger" loading={danger.busy} disabled={del.confirm !== "DELETE" || !del.password}>Delete account</Button>
        </form>
        {danger.status && <Alert tone={danger.status.tone} className="mt-4">{danger.status.msg}</Alert>}
      </Section>
    </div>
  );
}
