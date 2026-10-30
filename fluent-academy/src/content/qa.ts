import { normalizeAnswer, orderTokens } from "./text";
import type { CourseDef, ExerciseDef, LessonDef, PassageDef, VocabEntry } from "./types";

/**
 * Content quality rules. Pure functions used by the QA script, the completeness
 * manifest, the admin editor (to validate edits before saving) and tests.
 */

export type Severity = "error" | "warning";
export interface Issue {
  severity: Severity;
  where: string;
  message: string;
}

export const LESSON_REQUIREMENTS = {
  minObjectives: 2,
  minVocab: 8,
  minGrammarChars: 200,
  minGrammarExamples: 3,
  minDialogueLines: 6,
  minMistakes: 2,
  minAuthoredExercises: 8,
  minAuthoredTypes: 4,
  minTotalExercises: 15,
};

export function checkExercise(e: ExerciseDef, where = e.key): Issue[] {
  const out: Issue[] = [];
  const err = (message: string) => out.push({ severity: "error", where, message });
  const p = e.prompt;
  const a = e.answer;
  if (!e.explanation || e.explanation.trim().length < 3) err("missing explanation");
  switch (a.kind) {
    case "mc": {
      const opts = p.kind === "mc" || p.kind === "listen" ? p.options : null;
      if (!opts) err(`answer kind mc but prompt kind ${p.kind}`);
      else {
        if (a.correct < 0 || a.correct >= opts.length) err("correct option index out of range");
        if (new Set(opts.map((o) => o.trim().toLowerCase())).size !== opts.length) err("duplicate options");
        if (opts.length < 2) err("fewer than two options");
      }
      if (p.kind === "listen" && !p.audio?.key) err("listening item without audio");
      break;
    }
    case "fill": {
      if (p.kind !== "fill") err("fill answer without fill prompt");
      else {
        if (p.blanks !== a.blanks.length) err(`${p.blanks} blanks but ${a.blanks.length} answers`);
        if (a.blanks.some((b) => !b.length || b.some((x) => !x.trim()))) err("empty accepted answer");
      }
      break;
    }
    case "order": {
      if (p.kind !== "order") err("order answer without order prompt");
      else {
        const target = a.sentences[0] ?? "";
        const { tokens } = orderTokens(target);
        if (normalizeAnswer([...tokens].sort().join(" ")) !== normalizeAnswer([...p.tokens].sort().join(" "))) err("tokens do not rebuild the answer sentence");
      }
      break;
    }
    case "match": {
      if (p.kind !== "match") err("match answer without match prompt");
      else {
        if (p.left.length !== a.pairs.length) err("pairs length differs from left items");
        if (new Set(a.pairs).size !== a.pairs.length || a.pairs.some((i) => i < 0 || i >= p.right.length)) err("pairs are not a permutation of the right column");
        if (new Set(p.left.map((x) => x.toLowerCase())).size !== p.left.length) err("duplicate left items");
        if (new Set(p.right.map((x) => x.toLowerCase())).size !== p.right.length) err("duplicate right items (ambiguous matching)");
      }
      break;
    }
    case "translate":
      if (!a.accepted.length || a.accepted.some((x) => !x.trim())) err("no accepted translation");
      break;
    case "short":
      if (!a.accepted.length && !a.keywords?.length) err("short answer without accepted answers or keywords");
      break;
    case "dictation":
      if (p.kind !== "dictation" || !p.audio?.key) err("dictation without audio");
      if (!a.text.trim()) err("dictation without text");
      break;
    case "speak":
      if (!a.target && !a.keywords?.length) err("speaking item without target or keywords");
      if (p.kind === "speak" && p.mode === "repeat" && !p.audio?.key) err("repeat item without model audio");
      break;
    case "write":
      if (p.kind !== "write" || p.minWords < 5) err("writing item without a sensible minimum length");
      if (!a.model?.trim()) err("writing item without model answer");
      break;
  }
  return out;
}

function checkVocab(v: VocabEntry, where: string): Issue[] {
  const out: Issue[] = [];
  if (!v.gloss.trim()) out.push({ severity: "error", where, message: `“${v.term}” has no translation` });
  if (!v.example.trim()) out.push({ severity: "error", where, message: `“${v.term}” has no example` });
  if (!v.audio?.key) out.push({ severity: "error", where, message: `“${v.term}” has no audio reference` });
  return out;
}

export function checkLesson(l: LessonDef, language: string): Issue[] {
  const R = LESSON_REQUIREMENTS;
  const out: Issue[] = [];
  const add = (severity: Severity, message: string) => out.push({ severity, where: l.slug, message });
  for (const e of l.exercises) out.push(...checkExercise(e));
  const keys = new Set<string>();
  for (const e of l.exercises) {
    if (keys.has(e.key)) add("error", `duplicate exercise key ${e.key}`);
    keys.add(e.key);
  }
  if (l.kind !== "LESSON") {
    if (l.exercises.length < 10) add("error", `only ${l.exercises.length} exercises (min 10)`);
    return out;
  }
  if (l.objectives.length < R.minObjectives) add("error", `only ${l.objectives.length} objectives`);
  if (l.vocab.length < R.minVocab) add("error", `only ${l.vocab.length} vocabulary items (min ${R.minVocab})`);
  for (const v of l.vocab) out.push(...checkVocab(v, l.slug));
  const terms = l.vocab.map((v) => v.term.toLowerCase());
  const dupTerms = terms.filter((t, i) => terms.indexOf(t) !== i);
  if (dupTerms.length) add("warning", `duplicate vocabulary: ${[...new Set(dupTerms)].join(", ")}`);
  const blocks = l.content.blocks;
  const grammar = blocks.find((b) => b.type === "grammar");
  if (!grammar || grammar.type !== "grammar") add("error", "no grammar explanation");
  else {
    if (grammar.body.length < R.minGrammarChars) add("error", `grammar explanation too short (${grammar.body.length} chars)`);
    if (grammar.examples.length < R.minGrammarExamples) add("error", `only ${grammar.examples.length} worked examples`);
  }
  const dialogue = blocks.find((b) => b.type === "dialogue");
  const reading = blocks.find((b) => b.type === "reading");
  if (!dialogue && !reading) add("error", "no dialogue or reading text");
  if (dialogue && dialogue.type === "dialogue" && dialogue.lines.length < R.minDialogueLines) add("error", `dialogue has only ${dialogue.lines.length} lines`);
  if (dialogue && dialogue.type === "dialogue" && language !== "en" && dialogue.lines.some((x) => !x.translation)) add("warning", "dialogue lines without translation");
  const mistakes = blocks.find((b) => b.type === "mistakes");
  if (!mistakes || (mistakes.type === "mistakes" && mistakes.items.length < R.minMistakes)) add("error", "fewer than 2 common-mistake explanations");
  if (!blocks.some((b) => b.type === "pronunciation")) add("warning", "no pronunciation section");
  if (!blocks.some((b) => b.type === "task")) add("warning", "no real-world task");
  const authored = l.exercises.filter((e) => !e.derived);
  if (authored.length < R.minAuthoredExercises) add("error", `only ${authored.length} authored exercises (min ${R.minAuthoredExercises})`);
  const types = new Set(authored.map((e) => e.type));
  if (types.size < R.minAuthoredTypes) add("error", `only ${types.size} authored exercise types (min ${R.minAuthoredTypes})`);
  if (l.exercises.length < R.minTotalExercises) add("error", `only ${l.exercises.length} exercises in total (min ${R.minTotalExercises})`);
  if (!l.exercises.some((e) => e.type === "LISTENING" || e.type === "DICTATION")) add("error", "no listening practice");
  if (!l.exercises.some((e) => e.type === "SPEAKING")) add("error", "no speaking practice");
  if (!l.exercises.some((e) => e.type === "WRITING" || e.type === "TRANSLATION")) add("warning", "no writing or translation practice");
  return out;
}

export function checkPassage(p: PassageDef): Issue[] {
  const out: Issue[] = [];
  const add = (severity: Severity, message: string) => out.push({ severity, where: p.slug, message });
  const ranges: Record<string, [number, number]> = { A1: [60, 260], A2: [120, 400], B1: [200, 650], B2: [300, 900] };
  const [min, max] = ranges[p.level] ?? [50, 1000];
  if (p.wordCount < min) add("warning", `${p.wordCount} words is short for ${p.level} (expected ≥ ${min})`);
  if (p.wordCount > max) add("warning", `${p.wordCount} words is long for ${p.level} (expected ≤ ${max})`);
  if (p.questions.length < 4) add("error", `only ${p.questions.length} comprehension questions (min 4)`);
  if (p.glossary.length < 5) add("error", `only ${p.glossary.length} glossary entries (min 5)`);
  if (!p.audio?.key) add("error", "no audio reference");
  for (const q of p.questions) {
    out.push(...checkExercise({ key: q.id, order: 0, type: q.type, skill: "reading", prompt: q.prompt, answer: q.answer, explanation: q.explanation, tags: [], points: 10, derived: false }, q.id));
  }
  return out;
}

/** Content-wide checks: duplicate prompts across lessons, CEFR progression of key metrics. */
export function checkCourseProgression(courses: CourseDef[]): Issue[] {
  const out: Issue[] = [];
  const levels = ["A1", "A2", "B1", "B2"];
  const byLang = new Map<string, CourseDef[]>();
  for (const c of courses) byLang.set(c.language, [...(byLang.get(c.language) ?? []), c]);
  for (const [lang, list] of byLang) {
    const sorted = [...list].sort((a, b) => levels.indexOf(a.level) - levels.indexOf(b.level));
    let prevLen = 0;
    for (const c of sorted) {
      const lessons = c.units.flatMap((u) => u.lessons).filter((l) => l.kind === "LESSON");
      const lines = lessons.flatMap((l) => l.content.blocks.flatMap((b) => (b.type === "dialogue" ? b.lines.map((x) => x.text) : [])));
      const avg = lines.length ? lines.reduce((n, t) => n + t.split(/\s+/).length, 0) / lines.length : 0;
      if (prevLen && avg && avg < prevLen * 0.85) out.push({ severity: "warning", where: c.slug, message: `average dialogue line length (${avg.toFixed(1)} words) is lower than the previous level (${prevLen.toFixed(1)})` });
      if (avg) prevLen = avg;
    }
    // The same authored prompt appearing in several lessons usually means copy-paste.
    const seen = new Map<string, string>();
    for (const c of sorted) {
      for (const l of c.units.flatMap((u) => u.lessons).filter((x) => x.kind === "LESSON")) {
        for (const e of l.exercises.filter((x) => !x.derived)) {
          const p = e.prompt;
          const text = p.kind === "mc" ? p.question + p.options.join("|") : p.kind === "fill" ? p.sentence : p.kind === "translate" ? p.source : "";
          if (!text) continue;
          const k = `${lang}:${text.toLowerCase()}`;
          if (seen.has(k) && seen.get(k) !== l.slug) out.push({ severity: "warning", where: l.slug, message: `exercise duplicates one in ${seen.get(k)}: “${text.slice(0, 60)}”` });
          else seen.set(k, l.slug);
        }
      }
    }
  }
  return out;
}
