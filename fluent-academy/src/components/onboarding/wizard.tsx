"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { COURSE_LANGUAGE_INFO, DAILY_GOALS, FOCUS_AREAS, LEVEL_INFO, NATIVE_LANGUAGES, OBJECTIVES } from "@/lib/languages";

type Step = "native" | "target" | "level" | "objective" | "goal" | "focus" | "summary";
const STEPS: Step[] = ["native", "target", "level", "objective", "goal", "focus", "summary"];

function OptionCard({
  selected,
  onClick,
  title,
  description,
  badge,
  role = "radio",
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
  badge?: string;
  role?: "radio" | "checkbox";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border bg-white px-4 py-3.5 text-left transition-[border-color,box-shadow,background-color]",
        selected ? "border-navy-700 shadow-[0_0_0_3px_var(--color-navy-100)]" : "border-line hover:border-navy-200 hover:bg-navy-50/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border",
          role === "radio" ? "rounded-full" : "rounded-md",
          selected ? "border-navy-800 bg-navy-800 text-white" : "border-navy-200 bg-white",
        )}
        aria-hidden
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-medium text-navy-900">{title}</span>
          {badge && <span className="rounded-full bg-gold-50 px-2 py-0.5 text-[0.7rem] font-semibold text-gold-700 ring-1 ring-gold-200">{badge}</span>}
        </span>
        {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
      </span>
    </button>
  );
}

export function OnboardingWizard({
  userName,
  availableLevels,
  placementLanguages,
}: {
  userName: string;
  availableLevels: Record<string, string[]>;
  placementLanguages: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("native");
  const [nativeLanguage, setNative] = useState("");
  const [targetLanguage, setTarget] = useState("");
  const [level, setLevel] = useState("");
  const [takePlacement, setTakePlacement] = useState(false);
  const [objective, setObjective] = useState("");
  const [goal, setGoal] = useState(15);
  const [focus, setFocus] = useState<string[]>(["speaking"]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const index = STEPS.indexOf(step);
  const canContinue = useMemo(() => {
    switch (step) {
      case "native": return Boolean(nativeLanguage);
      case "target": return Boolean(targetLanguage) && targetLanguage !== nativeLanguage;
      case "level": return Boolean(level);
      case "objective": return Boolean(objective);
      case "goal": return Boolean(goal);
      case "focus": return true;
      default: return true;
    }
  }, [step, nativeLanguage, targetLanguage, level, objective, goal]);

  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, index + 1)]!);
  const back = () => setStep(STEPS[Math.max(0, index - 1)]!);
  const levels = availableLevels[targetLanguage] ?? [];

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ next: string }>("/api/onboarding", {
        body: {
          nativeLanguage,
          targetLanguage,
          level,
          objective,
          dailyGoalMinutes: goal,
          focusAreas: focus,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          takePlacement,
        },
      });
      router.replace(res.next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't save your answers. Please try again.");
      setSaving(false);
    }
  }

  const langName = COURSE_LANGUAGE_INFO[targetLanguage]?.name ?? "";

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs font-medium text-muted">
          <span>Step {index + 1} of {STEPS.length}</span>
          <span>{Math.round(((index + 1) / STEPS.length) * 100)}%</span>
        </div>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={cn("h-1 flex-1 rounded-full transition-colors", i <= index ? "bg-navy-800" : "bg-navy-100")} />
          ))}
        </div>
      </div>

      <div key={step} className="animate-rise">
        {step === "native" && (
          <section aria-labelledby="q-native">
            <h1 id="q-native" className="display text-3xl">Welcome, {userName.split(" ")[0]}. What&apos;s your native language?</h1>
            <p className="mt-2 text-muted">The coach can explain corrections in this language when you ask it to.</p>
            <label htmlFor="native" className="sr-only">Native language</label>
            <Select id="native" className="mt-6" value={nativeLanguage} onChange={(e) => setNative(e.target.value)}>
              <option value="">Choose a language…</option>
              {NATIVE_LANGUAGES.map(([c, n]) => (
                <option key={c} value={c}>{n}</option>
              ))}
            </Select>
          </section>
        )}

        {step === "target" && (
          <section aria-labelledby="q-target">
            <h1 id="q-target" className="display text-3xl">Which language do you want to speak?</h1>
            <p className="mt-2 text-muted">You can add more languages later from your dashboard.</p>
            <div role="radiogroup" aria-labelledby="q-target" className="mt-6 grid gap-3 sm:grid-cols-2">
              {Object.entries(COURSE_LANGUAGE_INFO).filter(([code]) => availableLevels[code]?.length).map(([code, l]) => (
                <OptionCard
                  key={code}
                  selected={targetLanguage === code}
                  onClick={() => {
                    setTarget(code);
                    setLevel("");
                  }}
                  title={`${l.native}`}
                  description={l.name}
                />
              ))}
            </div>
            {Object.keys(COURSE_LANGUAGE_INFO).some((c) => !availableLevels[c]?.length) && (
              <p className="mt-4 text-sm text-muted">
                In preparation:{" "}
                {Object.entries(COURSE_LANGUAGE_INFO)
                  .filter(([c]) => !availableLevels[c]?.length)
                  .map(([, l]) => l.name)
                  .join(", ")}
              </p>
            )}
            {targetLanguage && targetLanguage === nativeLanguage && (
              <Alert tone="warning" className="mt-4">That&apos;s your native language — pick the language you want to learn.</Alert>
            )}
          </section>
        )}

        {step === "level" && (
          <section aria-labelledby="q-level">
            <h1 id="q-level" className="display text-3xl">How much {langName} do you know?</h1>
            <p className="mt-2 text-muted">Pick the description that fits best. Levels follow the CEFR scale (A1–B2).</p>
            <div role="radiogroup" aria-labelledby="q-level" className="mt-6 space-y-3">
              {(["A1", "A2", "B1", "B2"] as const).map((code) => {
                const available = levels.includes(code);
                return (
                  <OptionCard
                    key={code}
                    selected={level === code}
                    onClick={() => setLevel(code)}
                    title={`${code} · ${LEVEL_INFO[code]!.name}`}
                    description={LEVEL_INFO[code]!.selfDescription + (available ? "" : " (Course in preparation — you'll start with the closest available level.)")}
                    badge={code === "B1" ? "Most learners" : undefined}
                  />
                );
              })}
            </div>
            {placementLanguages.includes(targetLanguage) && (
              <label className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-navy-200 bg-navy-50/40 px-4 py-3.5 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-navy-800" checked={takePlacement} onChange={(e) => setTakePlacement(e.target.checked)} />
                <span>
                  <span className="flex items-center gap-1.5 font-medium text-navy-900">
                    <Compass className="h-4 w-4 text-gold-600" /> Not sure? Take a 10-minute placement check after this.
                  </span>
                  <span className="mt-0.5 block text-muted">It adapts as you go and suggests a starting level. You can always change it.</span>
                </span>
              </label>
            )}
          </section>
        )}

        {step === "objective" && (
          <section aria-labelledby="q-objective">
            <h1 id="q-objective" className="display text-3xl">What are you learning {langName} for?</h1>
            <p className="mt-2 text-muted">We use this to choose conversation scenarios and reading topics.</p>
            <div role="radiogroup" aria-labelledby="q-objective" className="mt-6 grid gap-3 sm:grid-cols-2">
              {OBJECTIVES.map(([code, title, description]) => (
                <OptionCard key={code} selected={objective === code} onClick={() => setObjective(code)} title={title} description={description} />
              ))}
            </div>
          </section>
        )}

        {step === "goal" && (
          <section aria-labelledby="q-goal">
            <h1 id="q-goal" className="display text-3xl">Set a daily goal</h1>
            <p className="mt-2 text-muted">Consistency matters more than intensity. You can change this any time.</p>
            <div role="radiogroup" aria-labelledby="q-goal" className="mt-6 space-y-3">
              {DAILY_GOALS.map((g) => (
                <OptionCard key={g.minutes} selected={goal === g.minutes} onClick={() => setGoal(g.minutes)} title={`${g.label} · ${g.xp} XP`} description={g.description} />
              ))}
            </div>
          </section>
        )}

        {step === "focus" && (
          <section aria-labelledby="q-focus">
            <h1 id="q-focus" className="display text-3xl">What do you find most difficult?</h1>
            <p className="mt-2 text-muted">Choose any that apply. Your practice will lean towards these areas until your results show otherwise.</p>
            <div role="group" aria-labelledby="q-focus" className="mt-6 grid gap-3 sm:grid-cols-2">
              {FOCUS_AREAS.map(([code, label]) => (
                <OptionCard
                  key={code}
                  role="checkbox"
                  selected={focus.includes(code)}
                  onClick={() => setFocus((f) => (f.includes(code) ? f.filter((x) => x !== code) : [...f, code]))}
                  title={label}
                />
              ))}
            </div>
          </section>
        )}

        {step === "summary" && (
          <section aria-labelledby="q-summary">
            <h1 id="q-summary" className="display text-3xl">Your learning plan</h1>
            <dl className="mt-6 divide-y divide-line rounded-xl border border-line bg-white text-sm">
              {[
                ["Native language", NATIVE_LANGUAGES.find(([c]) => c === nativeLanguage)?.[1]],
                ["Learning", langName],
                ["Starting level", `${level} · ${LEVEL_INFO[level]?.name ?? ""}${takePlacement ? " (to be checked by placement)" : ""}`],
                ["Goal", OBJECTIVES.find(([c]) => c === objective)?.[1]],
                ["Daily goal", `${goal} minutes`],
                ["Focus areas", focus.length ? focus.map((f) => FOCUS_AREAS.find(([c]) => c === f)?.[1]).join(", ") : "None selected"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium text-navy-900">{v}</dd>
                </div>
              ))}
            </dl>
            {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
          </section>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={index === 0 || saving}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {step === "summary" ? (
          <Button size="lg" onClick={finish} loading={saving}>
            {takePlacement ? "Start placement check" : "Go to my dashboard"} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="lg" onClick={next} disabled={!canContinue}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
