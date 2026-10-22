import { createHash } from "node:crypto";
import {
  lines,
  parseDialogueLine,
  parseExampleLine,
  parseExerciseLine,
  parseGlossaryLine,
  parseKeywords,
  parseMistakeLine,
  parseOptions,
  parseSpeakers,
  parseTable,
  parseVocabLine,
  splitFields,
  type RawExercise,
} from "./dsl";
import { cleanText, countWords, orderTokens, seededRandom, seededShuffle } from "./text";
import type {
  AudioRef,
  AudioRequest,
  CefrCode,
  CourseDef,
  CourseLanguage,
  CourseSyllabus,
  DialogueLine,
  ExerciseDef,
  ExercisePrompt,
  ExerciseTypeName,
  LessonBlock,
  LessonDef,
  PassageDef,
  PlacementItemDef,
  QuestionDef,
  ScenarioDef,
  Skill,
  Speaker,
  TaxonomyEntry,
  UnitDef,
  VocabEntry,
} from "./types";
import { LANGUAGE_META, voiceFor } from "./voices";

export const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const pad2 = (n: number) => String(n).padStart(2, "0");
const langName = (code: string) => LANGUAGE_META[code]?.name ?? code;

/** Collects every audio clip the content needs so the generator can produce it. */
export class AudioCollector {
  private map = new Map<string, AudioRequest>();

  ref(language: string, text: string, opts: { gender?: "f" | "m"; voice?: string; slow?: boolean; usage: string }): AudioRef {
    const voice = opts.voice ?? voiceFor(language, opts.gender ?? "f").id;
    const key = this.add(language, text, voice, "normal", opts.usage);
    const ref: AudioRef = { key };
    if (opts.slow) ref.slowKey = this.add(language, text, voice, "slow", opts.usage);
    return ref;
  }

  /** Multi-speaker clip (dialogues, listening passages) assembled from parts. */
  composite(language: string, parts: { text: string; gender: "f" | "m" }[], usage: string): AudioRef {
    const text = parts.map((p) => `${p.gender}:${cleanText(p.text)}`).join("\n");
    const voice = "composite";
    const h = sha1(`${voice}|normal|${text}`);
    const key = `${language}/dialogue/${h.slice(0, 2)}/${h.slice(0, 16)}.mp3`;
    if (!this.map.has(key)) {
      this.map.set(key, {
        key,
        language,
        text,
        voice: parts.map((p) => voiceFor(language, p.gender).id).join(","),
        speed: "normal",
        usage,
      });
    }
    return { key };
  }

  private add(language: string, text: string, voice: string, speed: "normal" | "slow", usage: string) {
    const clean = cleanText(text);
    const h = sha1(`${voice}|${speed}|${clean}`);
    const voiceSlug = voice.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
    const key = `${language}/${voiceSlug}/${h.slice(0, 2)}/${h.slice(0, 16)}${speed === "slow" ? "-slow" : ""}.mp3`;
    if (!this.map.has(key)) this.map.set(key, { key, language, text: clean, voice, speed, usage });
    return key;
  }

  all(): AudioRequest[] {
    return [...this.map.values()];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw authoring shapes (YAML)
// ─────────────────────────────────────────────────────────────────────────────

export interface RawLesson {
  title: string;
  summary: string;
  minutes?: number;
  skills?: string[];
  objectives?: string[];
  tags?: string[];
  intro?: string;
  vocab?: string;
  grammar?: { title: string; body: string; table?: string; examples?: string; tip?: string };
  dialogue?: { title: string; setting?: string; speakers: string; lines: string };
  reading?: { title: string; text: string; translation?: string };
  pronunciation?: { title: string; body: string; items: string };
  culture?: { title: string; body: string };
  mistakes?: string;
  task?: { title: string; body: string; mode?: "speaking" | "writing" | "interaction" };
  exercises?: string;
}

export interface RawUnit {
  unit: number;
  title: string;
  theme: string;
  description: string;
  objectives?: string[];
  canDo?: string[];
  free?: boolean;
  review?: string;
  lessons: RawLesson[];
}

export interface RawCourse {
  language: CourseLanguage;
  level: CefrCode;
  title: string;
  description: string;
  monolingual?: boolean;
  hours: number;
  summary: string;
  objectives: string[];
  canDo: Record<string, string[]>;
  grammar: string[];
  vocabularyDomains: string[];
  assessment: string;
  units: { title: string; theme: string; lessons: string[] }[];
  assessmentItems?: string;
}

interface Ctx {
  language: CourseLanguage;
  level: CefrCode;
  monolingual: boolean;
  audio: AudioCollector;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercises
// ─────────────────────────────────────────────────────────────────────────────

interface ExerciseScope {
  keyPrefix: string; // e.g. fr-a1-u01-l02
  lessonTags: string[];
  vocabTag: string;
  dialogue?: { lines: DialogueLine[]; speakers: Speaker[]; audio?: AudioRef };
  readingText?: string;
}

const TYPE_FOR: Record<string, ExerciseTypeName> = {
  mc: "MULTIPLE_CHOICE",
  tf: "MULTIPLE_CHOICE",
  fill: "FILL_BLANK",
  order: "SENTENCE_ORDER",
  match: "MATCHING",
  tr: "TRANSLATION",
  "tr-en": "TRANSLATION",
  rw: "TRANSLATION",
  short: "SHORT_ANSWER",
  listen: "LISTENING",
  dict: "DICTATION",
  say: "SPEAKING",
  ask: "SPEAKING",
  write: "WRITING",
};

const DEFAULT_SKILL: Record<string, Skill> = {
  mc: "grammar",
  tf: "reading",
  fill: "grammar",
  order: "grammar",
  match: "vocabulary",
  tr: "translation",
  "tr-en": "translation",
  rw: "grammar",
  short: "reading",
  listen: "listening",
  dict: "listening",
  say: "pronunciation",
  ask: "speaking",
  write: "writing",
};

export function buildExercise(raw: RawExercise, ctx: Ctx, scope: ExerciseScope, key: string, order: number): ExerciseDef {
  const f = raw.fields;
  const need = (n: number) => {
    if (f.length < n) throw new Error(`Exercise needs ${n} fields: "${raw.source}"`);
  };
  const L = ctx.language;
  let prompt: ExercisePrompt;
  let answer: ExerciseDef["answer"];
  let explanation = "";
  const skill = (raw.attrs.skill as Skill) || DEFAULT_SKILL[raw.kind]!;

  switch (raw.kind) {
    case "mc": {
      need(3);
      const { options, correct } = shuffleOptions(parseOptions(f[1]!, raw.source), key);
      prompt = { kind: "mc", question: f[0]!, options };
      if (raw.attrs.ctx === "dialogue" && scope.dialogue) prompt.context = dialogueText(scope.dialogue);
      if (raw.attrs.ctx === "reading" && scope.readingText) prompt.context = scope.readingText;
      answer = { kind: "mc", correct };
      explanation = f[2]!;
      break;
    }
    case "tf": {
      need(3);
      const truth = f[1]!.toLowerCase();
      if (truth !== "true" && truth !== "false") throw new Error(`tf answer must be true/false: "${raw.source}"`);
      prompt = { kind: "mc", question: f[0]!, options: ["True", "False"] };
      if (raw.attrs.ctx === "dialogue" && scope.dialogue) prompt.context = dialogueText(scope.dialogue);
      if (raw.attrs.ctx === "reading" && scope.readingText) prompt.context = scope.readingText;
      answer = { kind: "mc", correct: truth === "true" ? 0 : 1 };
      explanation = f[2]!;
      break;
    }
    case "fill": {
      need(3);
      const blanks = (f[0]!.match(/___/g) || []).length;
      if (!blanks) throw new Error(`fill needs ___ blanks: "${raw.source}"`);
      const answers = f[1]!.split(";").map((b) => b.split("/").map((s) => s.trim()).filter(Boolean));
      if (answers.length !== blanks) throw new Error(`fill has ${blanks} blanks but ${answers.length} answers: "${raw.source}"`);
      prompt = { kind: "fill", sentence: f[0]!, blanks, hint: raw.attrs.hint };
      answer = { kind: "fill", blanks: answers };
      explanation = f[2]!;
      break;
    }
    case "order": {
      need(1);
      const { tokens, prefix, suffix } = orderTokens(f[0]!);
      if (tokens.length < 3) throw new Error(`order sentence too short: "${raw.source}"`);
      prompt = {
        kind: "order",
        tokens: seededShuffle(tokens, key),
        prefix: prefix || undefined,
        suffix: suffix || undefined,
        translation: f[1] || undefined,
      };
      const alts = raw.attrs.alt ? splitFields(raw.attrs.alt) : [];
      answer = { kind: "order", sentences: [cleanText(f[0]!), ...alts] };
      explanation = f[2] || `The correct order is: ${cleanText(f[0]!)}`;
      break;
    }
    case "match": {
      need(1);
      const pairs = f[0]!.split(";").map((p) => {
        const [a, b] = p.split("=").map((s) => s.trim());
        if (!a || !b) throw new Error(`match pair must be "a = b": "${raw.source}"`);
        return [a, b] as const;
      });
      if (pairs.length < 3) throw new Error(`match needs at least 3 pairs: "${raw.source}"`);
      const right = seededShuffle(pairs.map((p) => p[1]), key);
      prompt = { kind: "match", left: pairs.map((p) => p[0]), right, instruction: raw.attrs.hint };
      answer = { kind: "match", pairs: pairs.map((p) => right.indexOf(p[1])) };
      explanation = f[1] || pairs.map((p) => `${p[0]} → ${p[1]}`).join(" · ");
      break;
    }
    case "tr":
    case "tr-en":
    case "rw": {
      need(3);
      let source = f[0]!;
      let instruction: string;
      if (raw.kind === "rw") {
        const [ins, src] = f[0]!.split("::").map((s) => s.trim());
        if (!ins || !src) throw new Error(`rw needs "INSTRUCTION :: SOURCE": "${raw.source}"`);
        instruction = ins;
        source = src;
      } else if (raw.kind === "tr") {
        instruction = `Translate into ${langName(L)}.`;
      } else {
        instruction = "Translate into English.";
      }
      prompt = {
        kind: "translate",
        source,
        instruction,
        from: raw.kind === "tr" ? "en" : L,
        to: raw.kind === "tr-en" ? "en" : L,
      };
      answer = { kind: "translate", accepted: splitFields(f[1]!) };
      explanation = f[2]!;
      break;
    }
    case "short": {
      need(3);
      const kw = parseKeywords(f[1]!);
      prompt = { kind: "short", question: f[0]! };
      if (raw.attrs.ctx === "dialogue" && scope.dialogue) prompt.context = dialogueText(scope.dialogue);
      if (raw.attrs.ctx === "reading" && scope.readingText) prompt.context = scope.readingText;
      answer = kw ? { kind: "short", accepted: [], keywords: kw } : { kind: "short", accepted: splitFields(f[1]!) };
      explanation = f[2]!;
      break;
    }
    case "listen": {
      need(4);
      const { options, correct } = shuffleOptions(parseOptions(f[2]!, raw.source), key);
      let audio: AudioRef;
      let transcript: string;
      if (f[0] === "@dialogue" || f[0] === "dialogue") {
        if (!scope.dialogue?.audio) throw new Error(`listen @dialogue used without a dialogue: "${raw.source}"`);
        audio = scope.dialogue.audio;
        transcript = dialogueText(scope.dialogue);
      } else {
        audio = ctx.audio.ref(L, f[0]!, { usage: `${key}:listen`, slow: true });
        transcript = f[0]!;
      }
      prompt = { kind: "listen", question: f[1]!, options, audio };
      answer = { kind: "mc", correct, transcript };
      explanation = f[3]!;
      break;
    }
    case "dict": {
      need(1);
      const audio = ctx.audio.ref(L, f[0]!, { usage: `${key}:dictation`, slow: true });
      prompt = { kind: "dictation", audio, hint: f[1] || undefined, words: countWords(f[0]!) };
      answer = { kind: "dictation", text: cleanText(f[0]!) };
      explanation = `You heard: “${cleanText(f[0]!)}”`;
      break;
    }
    case "say": {
      need(1);
      const audio = ctx.audio.ref(L, f[0]!, { usage: `${key}:speaking`, slow: true });
      prompt = {
        kind: "speak",
        mode: "repeat",
        text: f[0]!,
        translation: f[1] || undefined,
        instruction: "Listen, then say the sentence aloud.",
        audio,
      };
      answer = { kind: "speak", target: cleanText(f[0]!) };
      explanation = f[2] || "Compare your recording with the model audio, focusing on any highlighted words.";
      break;
    }
    case "ask": {
      need(3);
      const kw = parseKeywords(f[1]!);
      if (!kw) throw new Error(`ask needs "kw: ..." keywords: "${raw.source}"`);
      prompt = { kind: "speak", mode: "respond", instruction: f[0]! };
      answer = { kind: "speak", keywords: kw, model: f[2]! };
      explanation = `A possible answer: ${f[2]!}`;
      break;
    }
    case "write": {
      need(4);
      const min = Number(f[1]!.replace(/^min=/, ""));
      if (!Number.isFinite(min) || min < 5) throw new Error(`write needs min=N: "${raw.source}"`);
      const req = f[2]!.replace(/^req:\s*/, "");
      const patterns = req === "-" ? [] : splitFields(req);
      prompt = {
        kind: "write",
        instruction: f[0]!,
        minWords: min,
        // Each requirement is a phrase the text must contain; "/" separates acceptable alternatives.
        requirements: patterns.map((p) => p.split("/").map((s) => s.trim()).join(" / ")),
      };
      answer = { kind: "write", patterns, model: f[3]! };
      explanation = `Model answer: ${f[3]!}`;
      break;
    }
    default:
      throw new Error(`Unhandled exercise kind ${raw.kind}`);
  }

  if (!explanation || explanation.length < 3) throw new Error(`Exercise needs an explanation: "${raw.source}"`);

  let tags = raw.attrs.tags ? raw.attrs.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  if (!tags.length) {
    if (skill === "grammar" || skill === "translation" || skill === "writing") tags = [...scope.lessonTags];
    else if (skill === "vocabulary") tags = [scope.vocabTag];
    else if (skill === "listening") tags = [`${L}.listening`];
    else if (skill === "reading") tags = [`${L}.reading`];
    else if (skill === "speaking") tags = [`${L}.speaking`, ...scope.lessonTags.slice(0, 1)];
    else if (skill === "pronunciation") tags = [`${L}.pronunciation`];
  }

  return {
    key,
    order,
    type: TYPE_FOR[raw.kind]!,
    skill,
    prompt,
    answer,
    explanation,
    tags,
    objective: raw.attrs.obj,
    points: 10,
    derived: false,
  };
}

/** Authors tend to place the right answer in the same slot; shuffle deterministically per exercise. */
function shuffleOptions(parsed: { options: string[]; correct: number }, key: string) {
  const order = seededShuffle(parsed.options.map((_, i) => i), `${key}:options`, true);
  return { options: order.map((i) => parsed.options[i]!), correct: order.indexOf(parsed.correct) };
}

function dialogueText(d: { lines: DialogueLine[]; speakers: Speaker[] }) {
  const names = new Map(d.speakers.map((s) => [s.id, s.name]));
  return d.lines.map((l) => `${names.get(l.speaker) ?? l.speaker}: ${l.text}`).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived practice (generated from authored vocabulary and dialogue)
// ─────────────────────────────────────────────────────────────────────────────

function derivedExercises(
  ctx: Ctx,
  keyPrefix: string,
  vocab: VocabEntry[],
  vocabTag: string,
  dialogue: { lines: DialogueLine[]; speakers: Speaker[] } | undefined,
  authoredKinds: Set<string>,
  opts: { matching?: number; meaning?: number; recognize?: number; dictation?: number; order?: number; speak?: number },
): Omit<ExerciseDef, "order">[] {
  const L = ctx.language;
  const out: Omit<ExerciseDef, "order">[] = [];
  const rand = seededRandom(`${keyPrefix}:derived`);
  const pick = <T,>(arr: T[], n: number) => seededShuffle(arr, `${keyPrefix}:${n}:${rand()}`).slice(0, n);
  const meaningLabel = ctx.monolingual ? "definition" : "meaning";

  // 1. Matching (term ↔ gloss)
  const matchCount = opts.matching ?? 1;
  const chunks = [vocab.slice(0, 6), vocab.slice(6, 12)].filter((c) => c.length >= 4).slice(0, matchCount);
  chunks.forEach((chunk, i) => {
    const key = `${keyPrefix}-d-match${i + 1}`;
    const right = seededShuffle(chunk.map((v) => v.gloss), key);
    out.push({
      key,
      type: "MATCHING",
      skill: "vocabulary",
      prompt: { kind: "match", left: chunk.map((v) => v.term), right, instruction: `Match each word with its ${meaningLabel}.` },
      answer: { kind: "match", pairs: chunk.map((v) => right.indexOf(v.gloss)) },
      explanation: chunk.map((v) => `${v.term} — ${v.gloss}`).join(" · "),
      tags: [vocabTag],
      points: 10,
      derived: true,
    });
  });

  // 2. Meaning multiple choice
  const meaningItems = pick(vocab, Math.min(opts.meaning ?? 3, vocab.length));
  for (const [i, v] of meaningItems.entries()) {
    const distractors = seededShuffle(
      vocab.filter((o) => o.key !== v.key && o.gloss !== v.gloss).map((o) => o.gloss),
      `${v.key}:mc`,
    ).slice(0, 3);
    if (distractors.length < 2) continue;
    const key = `${keyPrefix}-d-mean${i + 1}`;
    const options = seededShuffle([v.gloss, ...distractors], key, true);
    out.push({
      key,
      type: "MULTIPLE_CHOICE",
      skill: "vocabulary",
      prompt: {
        kind: "mc",
        question: ctx.monolingual ? `Which definition fits “${v.term}”?` : `What does “${v.term}” mean?`,
        options,
        audio: v.audio,
      },
      answer: { kind: "mc", correct: options.indexOf(v.gloss) },
      explanation: `“${v.term}” — ${v.gloss}. Example: ${v.example}${v.exampleTranslation ? ` (${v.exampleTranslation})` : ""}`,
      tags: [vocabTag],
      points: 10,
      derived: true,
    });
  }

  // 3. Listening recognition (hear a word, choose it)
  const recItems = pick(vocab, Math.min(opts.recognize ?? 2, vocab.length));
  for (const [i, v] of recItems.entries()) {
    if (!v.audio) continue;
    const distractors = seededShuffle(
      vocab.filter((o) => o.key !== v.key && o.term.toLowerCase() !== v.term.toLowerCase()).map((o) => o.term),
      `${v.key}:rec`,
    ).slice(0, 3);
    if (distractors.length < 2) continue;
    const key = `${keyPrefix}-d-hear${i + 1}`;
    const options = seededShuffle([v.term, ...distractors], key, true);
    out.push({
      key,
      type: "LISTENING",
      skill: "listening",
      prompt: { kind: "listen", question: "Which word do you hear?", options, audio: v.audio },
      answer: { kind: "mc", correct: options.indexOf(v.term), transcript: v.term },
      explanation: `You heard “${v.term}” (${v.gloss}).`,
      tags: [vocabTag, `${L}.listening`],
      points: 10,
      derived: true,
    });
  }

  // 4. Dictation from dialogue lines
  if (dialogue && !authoredKinds.has("dict")) {
    const candidates = dialogue.lines.filter((l) => {
      const n = countWords(l.text);
      return n >= 3 && n <= 12 && l.audio;
    });
    for (const [i, l] of pick(candidates, Math.min(opts.dictation ?? 2, candidates.length)).entries()) {
      out.push({
        key: `${keyPrefix}-d-dict${i + 1}`,
        type: "DICTATION",
        skill: "listening",
        prompt: { kind: "dictation", audio: l.audio!, words: countWords(l.text), hint: l.translation },
        answer: { kind: "dictation", text: cleanText(l.text) },
        explanation: `You heard: “${cleanText(l.text)}”${l.translation ? ` — ${l.translation}` : ""}`,
        tags: [`${L}.listening`],
        points: 10,
        derived: true,
      });
    }
  }

  // 5. Sentence order from example sentences
  const orderCandidates = vocab.filter((v) => {
    const n = orderTokens(v.example).tokens.length;
    return n >= 4 && n <= 11;
  });
  for (const [i, v] of pick(orderCandidates, Math.min(opts.order ?? 2, orderCandidates.length)).entries()) {
    const key = `${keyPrefix}-d-order${i + 1}`;
    const { tokens, prefix, suffix } = orderTokens(v.example);
    out.push({
      key,
      type: "SENTENCE_ORDER",
      skill: "grammar",
      prompt: {
        kind: "order",
        tokens: seededShuffle(tokens, key),
        prefix: prefix || undefined,
        suffix: suffix || undefined,
        translation: v.exampleTranslation,
      },
      answer: { kind: "order", sentences: [cleanText(v.example)] },
      explanation: `The sentence is: ${cleanText(v.example)}`,
      tags: [vocabTag],
      points: 10,
      derived: true,
    });
  }

  // 6. Speaking (repeat model sentences)
  const speakSource = [
    ...(dialogue?.lines.filter((l) => countWords(l.text) >= 3 && countWords(l.text) <= 14).map((l) => ({
      text: l.text,
      translation: l.translation,
      audio: l.audio,
    })) ?? []),
    ...vocab.map((v) => ({ text: v.example, translation: v.exampleTranslation, audio: v.exampleAudio })),
  ].filter((s) => s.audio);
  for (const [i, s] of pick(speakSource, Math.min(opts.speak ?? 2, speakSource.length)).entries()) {
    out.push({
      key: `${keyPrefix}-d-say${i + 1}`,
      type: "SPEAKING",
      skill: "pronunciation",
      prompt: {
        kind: "speak",
        mode: "repeat",
        text: s.text,
        translation: s.translation,
        instruction: "Listen to the model, then say the sentence aloud.",
        audio: s.audio,
      },
      answer: { kind: "speak", target: cleanText(s.text) },
      explanation: "Compare your recording with the model audio. Highlighted words were not recognised and are worth repeating.",
      tags: [`${L}.pronunciation`],
      points: 10,
      derived: true,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lessons
// ─────────────────────────────────────────────────────────────────────────────

function buildLesson(raw: RawLesson, ctx: Ctx, unit: RawUnit, index: number, unitSlug: string): LessonDef {
  const L = ctx.language;
  const slug = `${unitSlug}-l${pad2(index + 1)}`;
  const vocabTag = `vocab.${slug}`;
  const blocks: LessonBlock[] = [];
  const usage = (s: string) => `${slug}:${s}`;

  if (raw.intro) blocks.push({ type: "intro", title: raw.title, body: raw.intro.trim() });

  const vocab: VocabEntry[] = lines(raw.vocab).map((line, i) => {
    const v = parseVocabLine(line);
    const key = `${slug}-v${pad2(i + 1)}`;
    return {
      key,
      term: v.term,
      gloss: v.gloss,
      pos: v.pos,
      gender: v.gender,
      plural: v.plural,
      example: v.example,
      exampleTranslation: v.exampleTranslation,
      collocations: v.collocations,
      note: v.note,
      translations: v.translations,
      audio: ctx.audio.ref(L, v.term, { usage: usage(`vocab:${key}`), slow: true }),
      exampleAudio: ctx.audio.ref(L, v.example, { usage: usage(`example:${key}`) }),
    };
  });
  if (vocab.length) blocks.push({ type: "vocabulary", title: "Key vocabulary", items: vocab });

  if (raw.grammar) {
    blocks.push({
      type: "grammar",
      title: raw.grammar.title,
      body: raw.grammar.body.trim(),
      table: parseTable(raw.grammar.table),
      examples: lines(raw.grammar.examples).map((l) => {
        const e = parseExampleLine(l);
        return { ...e, audio: ctx.audio.ref(L, e.text, { usage: usage("grammar-example") }) };
      }),
      tip: raw.grammar.tip?.trim(),
    });
  }

  let dialogue: { lines: DialogueLine[]; speakers: Speaker[]; audio?: AudioRef } | undefined;
  if (raw.dialogue) {
    const speakers = parseSpeakers(raw.dialogue.speakers);
    const genderOf = new Map(speakers.map((s) => [s.id, s.gender]));
    const dl = lines(raw.dialogue.lines).map((l) => {
      const d = parseDialogueLine(l);
      if (!genderOf.has(d.speaker)) throw new Error(`Unknown speaker "${d.speaker}" in ${slug}`);
      return { ...d, audio: ctx.audio.ref(L, d.text, { gender: genderOf.get(d.speaker), usage: usage("dialogue-line"), slow: true }) };
    });
    const audio = ctx.audio.composite(
      L,
      dl.map((d) => ({ text: d.text, gender: genderOf.get(d.speaker)! })),
      usage("dialogue"),
    );
    dialogue = { lines: dl, speakers, audio };
    blocks.push({ type: "dialogue", title: raw.dialogue.title, setting: raw.dialogue.setting, speakers, lines: dl });
  }

  if (raw.reading) {
    blocks.push({
      type: "reading",
      title: raw.reading.title,
      text: raw.reading.text.trim(),
      translation: raw.reading.translation?.trim(),
      audio: ctx.audio.ref(L, raw.reading.text.trim(), { usage: usage("reading") }),
    });
  }

  if (raw.pronunciation) {
    blocks.push({
      type: "pronunciation",
      title: raw.pronunciation.title,
      body: raw.pronunciation.body.trim(),
      items: lines(raw.pronunciation.items).map((l) => {
        const [text, ipa] = splitFields(l);
        return { text: text!, ipa: ipa || undefined, audio: ctx.audio.ref(L, text!, { usage: usage("pronunciation"), slow: true }) };
      }),
    });
  }

  if (raw.culture) blocks.push({ type: "culture", title: raw.culture.title, body: raw.culture.body.trim() });

  const mistakes = lines(raw.mistakes).map(parseMistakeLine);
  if (mistakes.length) blocks.push({ type: "mistakes", title: "Common mistakes", items: mistakes });

  if (raw.task) blocks.push({ type: "task", title: raw.task.title, body: raw.task.body.trim(), mode: raw.task.mode ?? "speaking" });

  const scope: ExerciseScope = {
    keyPrefix: slug,
    lessonTags: raw.tags ?? [],
    vocabTag,
    dialogue,
    readingText: raw.reading?.text.trim(),
  };

  const authored: ExerciseDef[] = [];
  const authoredKinds = new Set<string>();
  lines(raw.exercises).forEach((line, i) => {
    try {
      const rawEx = parseExerciseLine(line);
      authoredKinds.add(rawEx.kind);
      authored.push(buildExercise(rawEx, ctx, scope, `${slug}-e${pad2(i + 1)}`, 0));
    } catch (err) {
      ctx.errors.push(`${slug}: ${(err as Error).message}`);
    }
  });

  const derived = derivedExercises(ctx, slug, vocab, vocabTag, dialogue, authoredKinds, {});
  // Interleave: vocabulary practice first, then authored work, then listening/speaking.
  const early = derived.filter((d) => d.type === "MATCHING" || (d.type === "MULTIPLE_CHOICE" && d.derived));
  const late = derived.filter((d) => !early.includes(d));
  const exercises = [...early, ...authored, ...late].map((e, i) => ({ ...e, order: i + 1 })) as ExerciseDef[];

  return {
    slug,
    unitSlug,
    order: index + 1,
    kind: "LESSON",
    title: raw.title,
    summary: raw.summary,
    minutes: raw.minutes ?? 30,
    skills: raw.skills ?? [],
    objectives: raw.objectives ?? [],
    grammarTags: raw.tags ?? [],
    content: { blocks },
    exercises,
    vocab,
    sourceHash: sha1(JSON.stringify(raw)),
  };
}

function buildUnitReview(unit: RawUnit, ctx: Ctx, unitSlug: string, lessons: LessonDef[]): LessonDef {
  const slug = `${unitSlug}-review`;
  const vocab = lessons.flatMap((l) => l.vocab);
  const blocks: LessonBlock[] = [
    {
      type: "summary",
      title: "What this unit covered",
      points: lessons.flatMap((l) => {
        const g = l.content.blocks.find((b) => b.type === "grammar");
        return [`${l.title}${g && g.type === "grammar" ? ` — ${g.title}` : ""}`];
      }),
    },
    { type: "vocabulary", title: "Unit vocabulary", items: vocab },
  ];
  if (unit.canDo?.length) blocks.push({ type: "cando", title: "Can you now…", items: unit.canDo });

  const scope: ExerciseScope = { keyPrefix: slug, lessonTags: lessons.flatMap((l) => l.grammarTags), vocabTag: `vocab.${unitSlug}` };
  const authored: ExerciseDef[] = [];
  lines(unit.review).forEach((line, i) => {
    try {
      authored.push(buildExercise(parseExerciseLine(line), ctx, scope, `${slug}-e${pad2(i + 1)}`, 0));
    } catch (err) {
      ctx.errors.push(`${slug}: ${(err as Error).message}`);
    }
  });

  // Cumulative recall: two authored items from each lesson, re-keyed for the review.
  const recall: ExerciseDef[] = [];
  for (const l of lessons) {
    const pool = l.exercises.filter((e) => !e.derived && ["MULTIPLE_CHOICE", "FILL_BLANK", "TRANSLATION", "SENTENCE_ORDER"].includes(e.type));
    for (const e of seededShuffle(pool, `${slug}:${l.slug}`).slice(0, 2)) {
      recall.push({ ...e, key: `${slug}-r-${e.key.split("-").slice(-2).join("-")}`, tags: e.tags });
    }
  }
  const dialogueLines = lessons.flatMap((l) =>
    l.content.blocks.flatMap((b) => (b.type === "dialogue" ? b.lines : [])),
  );
  const derived = derivedExercises(
    ctx,
    slug,
    seededShuffle(vocab, `${slug}:vocab`),
    `vocab.${unitSlug}`,
    dialogueLines.length ? { lines: dialogueLines, speakers: [] } : undefined,
    new Set(),
    { matching: 2, meaning: 4, recognize: 2, dictation: 2, order: 1, speak: 1 },
  );
  const exercises = [...derived.slice(0, 2), ...authored, ...recall, ...derived.slice(2)].map((e, i) => ({
    ...e,
    order: i + 1,
  })) as ExerciseDef[];

  return {
    slug,
    unitSlug,
    order: lessons.length + 1,
    kind: "UNIT_REVIEW",
    title: `Unit ${unit.unit} review`,
    summary: `Consolidate the vocabulary and grammar of “${unit.title}” with mixed, cumulative practice.`,
    minutes: 25,
    skills: ["vocabulary", "grammar", "listening", "speaking"],
    objectives: unit.objectives ?? [],
    grammarTags: [...new Set(lessons.flatMap((l) => l.grammarTags))],
    content: { blocks },
    exercises,
    vocab: [],
    sourceHash: sha1(JSON.stringify({ review: unit.review, lessons: lessons.map((l) => l.sourceHash) })),
  };
}

export function buildUnit(raw: RawUnit, ctx: Ctx, courseSlug: string): UnitDef {
  const slug = `${courseSlug}-u${pad2(raw.unit)}`;
  const lessons: LessonDef[] = [];
  raw.lessons.forEach((l, i) => {
    try {
      lessons.push(buildLesson(l, ctx, raw, i, slug));
    } catch (err) {
      ctx.errors.push(`${slug}-l${pad2(i + 1)}: ${(err as Error).message}`);
    }
  });
  if (lessons.length) lessons.push(buildUnitReview(raw, ctx, slug, lessons));
  return {
    slug,
    order: raw.unit,
    title: raw.title,
    description: raw.description,
    theme: raw.theme,
    objectives: raw.objectives ?? [],
    canDo: raw.canDo ?? [],
    isFree: Boolean(raw.free),
    lessons,
  };
}

export function buildCourse(raw: RawCourse, rawUnits: RawUnit[], audio: AudioCollector, errors: string[]): CourseDef {
  const slug = `${raw.language}-${raw.level.toLowerCase()}`;
  const ctx: Ctx = { language: raw.language, level: raw.level, monolingual: Boolean(raw.monolingual), audio, errors };
  const units = rawUnits.sort((a, b) => a.unit - b.unit).map((u) => buildUnit(u, ctx, slug));

  // Level assessment: authored items + one cumulative item per unit.
  if (units.some((u) => u.lessons.length)) {
    const aslug = `${slug}-assessment`;
    const scope: ExerciseScope = { keyPrefix: aslug, lessonTags: [], vocabTag: `vocab.${slug}` };
    const authored: ExerciseDef[] = [];
    lines(raw.assessmentItems).forEach((line, i) => {
      try {
        authored.push(buildExercise(parseExerciseLine(line), ctx, scope, `${aslug}-e${pad2(i + 1)}`, 0));
      } catch (err) {
        errors.push(`${aslug}: ${(err as Error).message}`);
      }
    });
    const sampled: ExerciseDef[] = [];
    for (const u of units) {
      const pool = u.lessons
        .filter((l) => l.kind === "LESSON")
        .flatMap((l) => l.exercises.filter((e) => !e.derived && ["MULTIPLE_CHOICE", "FILL_BLANK", "TRANSLATION", "LISTENING"].includes(e.type)));
      for (const e of seededShuffle(pool, `${aslug}:${u.slug}`).slice(0, 2)) {
        sampled.push({ ...e, key: `${aslug}-s-${e.key.replace(`${slug}-`, "")}` });
      }
    }
    const exercises = [...authored, ...sampled].map((e, i) => ({ ...e, order: i + 1 }));
    units.push({
      slug: `${slug}-final`,
      order: 99,
      title: `${raw.level} level assessment`,
      description: `A cumulative assessment of the ${raw.level} objectives across reading, listening, grammar, vocabulary and writing.`,
      theme: "assessment",
      objectives: raw.objectives,
      canDo: Object.values(raw.canDo).flat(),
      isFree: false,
      lessons: [
        {
          slug: aslug,
          unitSlug: `${slug}-final`,
          order: 1,
          kind: "LEVEL_ASSESSMENT",
          title: `${langName(raw.language)} ${raw.level} assessment`,
          summary: raw.assessment,
          minutes: 40,
          skills: ["reading", "listening", "grammar", "vocabulary", "writing"],
          objectives: raw.objectives,
          grammarTags: [],
          content: { blocks: [{ type: "cando", title: "This assessment checks that you can…", items: Object.values(raw.canDo).flat().slice(0, 8) }] },
          exercises,
          vocab: [],
          sourceHash: sha1(JSON.stringify({ items: raw.assessmentItems, units: units.map((u) => u.lessons.map((l) => l.sourceHash)) })),
        },
      ],
    });
  }

  const syllabus: CourseSyllabus = {
    hours: raw.hours,
    summary: raw.summary,
    objectives: raw.objectives,
    canDo: raw.canDo,
    grammar: raw.grammar,
    vocabularyDomains: raw.vocabularyDomains,
    assessment: raw.assessment,
    plannedUnits: raw.units.map((u, i) => ({ order: i + 1, title: u.title, theme: u.theme, lessons: u.lessons })),
  };

  return {
    slug,
    language: raw.language,
    level: raw.level,
    title: raw.title,
    description: raw.description,
    syllabus,
    units,
    sourceHash: sha1(JSON.stringify(raw)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading & listening library
// ─────────────────────────────────────────────────────────────────────────────

export interface RawPassage {
  slug: string;
  kind?: "reading" | "listening";
  title: string;
  topic: string;
  summary: string;
  free?: boolean;
  speakers?: string;
  text: string;
  translation?: string;
  glossary?: string;
  questions?: string;
}

export function buildPassage(raw: RawPassage, language: CourseLanguage, level: CefrCode, audio: AudioCollector, errors: string[]): PassageDef {
  const slug = `${language}-${level.toLowerCase()}-${raw.slug}`;
  const kind = raw.kind === "listening" ? "LISTENING" : "READING";
  const body = raw.text.trim();
  const speakers = raw.speakers ? parseSpeakers(raw.speakers) : undefined;
  let passageAudio: AudioRef;
  let lineAudio: AudioRef[] | undefined;
  const ctx: Ctx = { language, level, monolingual: language === "en", audio, errors };

  if (speakers?.length) {
    const genderOf = new Map(speakers.map((s) => [s.id, s.gender]));
    const dl = lines(body).map(parseDialogueLine);
    for (const d of dl) if (!genderOf.has(d.speaker)) errors.push(`${slug}: unknown speaker ${d.speaker}`);
    lineAudio = dl.map((d) => audio.ref(language, d.text, { gender: genderOf.get(d.speaker) ?? "f", usage: `${slug}:line` }));
    passageAudio = audio.composite(language, dl.map((d) => ({ text: d.text, gender: genderOf.get(d.speaker) ?? "f" })), `${slug}:passage`);
  } else {
    passageAudio = audio.ref(language, body.replace(/\n\s*\n/g, "\n"), { usage: `${slug}:passage`, gender: kind === "LISTENING" ? "m" : "f" });
  }

  const scope: ExerciseScope = { keyPrefix: slug, lessonTags: [], vocabTag: `vocab.${slug}`, readingText: undefined };
  const questions: QuestionDef[] = [];
  lines(raw.questions).forEach((line, i) => {
    try {
      const ex = buildExercise(parseExerciseLine(line), ctx, scope, `${slug}-q${pad2(i + 1)}`, i + 1);
      questions.push({ id: ex.key, prompt: ex.prompt, answer: ex.answer, explanation: ex.explanation, type: ex.type });
    } catch (err) {
      errors.push(`${slug}: ${(err as Error).message}`);
    }
  });

  const plain = speakers?.length ? lines(body).map((l) => parseDialogueLine(l).text).join(" ") : body;
  const wordCount = countWords(plain);
  return {
    slug,
    language,
    level,
    kind,
    title: raw.title,
    summary: raw.summary,
    topic: raw.topic,
    body,
    translation: raw.translation?.trim(),
    speakers,
    wordCount,
    // Learner reading speed is far below native speed; budget ~70–120 wpm by level plus questions.
    minutes: Math.max(3, Math.round(wordCount / ({ A1: 60, A2: 80, B1: 100, B2: 120 }[level] ?? 90)) + 3),
    glossary: lines(raw.glossary).map(parseGlossaryLine),
    questions,
    audio: passageAudio,
    lineAudio,
    isFree: Boolean(raw.free),
    sourceHash: sha1(JSON.stringify(raw)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios, placement, taxonomy
// ─────────────────────────────────────────────────────────────────────────────

export interface RawScenario {
  slug: string;
  title: string;
  description: string;
  category: string;
  levels: string; // "A1-B1"
  free?: boolean;
  order?: number;
  goals: string[];
  roles: { tutor: string; learner: string };
  languages: Record<string, { opener: string; vocab?: string; focus?: string[]; script: string }>;
}

export function buildScenario(raw: RawScenario): ScenarioDef {
  const [minLevel, maxLevel] = raw.levels.split("-").map((s) => s.trim()) as [CefrCode, CefrCode];
  const perLanguage: ScenarioDef["perLanguage"] = {};
  const focusTags: string[] = [];
  for (const [lang, data] of Object.entries(raw.languages)) {
    const [opener, openerTranslation] = splitFields(data.opener);
    perLanguage[lang] = {
      opener: opener!,
      openerTranslation: openerTranslation && openerTranslation !== "-" ? openerTranslation : undefined,
      vocabulary: lines(data.vocab).map((l) => {
        const [term, translation] = splitFields(l);
        return { term: term!, translation: translation ?? "" };
      }),
      script: lines(data.script).map((l) => {
        const [tutor, translation, hint, expect] = splitFields(l);
        return {
          tutor: tutor!,
          translation: translation && translation !== "-" ? translation : undefined,
          hint: hint || "Respond to the tutor.",
          expect: expect ? (parseKeywords(expect)?.flat() ?? undefined) : undefined,
        };
      }),
    };
    focusTags.push(...(data.focus ?? []));
  }
  return {
    slug: raw.slug,
    title: raw.title,
    description: raw.description,
    minLevel,
    maxLevel: maxLevel ?? minLevel,
    category: raw.category,
    goals: raw.goals,
    focusTags,
    roles: raw.roles,
    isFree: Boolean(raw.free),
    order: raw.order ?? 0,
    perLanguage,
  };
}

export function buildPlacement(language: CourseLanguage, raw: Record<string, string>, audio: AudioCollector, errors: string[]): PlacementItemDef[] {
  const items: PlacementItemDef[] = [];
  let order = 0;
  for (const level of ["A1", "A2", "B1", "B2"] as CefrCode[]) {
    const ctx: Ctx = { language, level, monolingual: language === "en", audio, errors };
    const scope: ExerciseScope = { keyPrefix: `placement-${language}`, lessonTags: [], vocabTag: `vocab.placement` };
    lines(raw[level]).forEach((line, i) => {
      try {
        const key = `placement-${language}-${level.toLowerCase()}-${pad2(i + 1)}`;
        const ex = buildExercise(parseExerciseLine(line), ctx, scope, key, ++order);
        items.push({ key, language, level, skill: ex.skill, order, prompt: ex.prompt, answer: ex.answer, explanation: ex.explanation });
      } catch (err) {
        errors.push(`placement-${language}-${level}: ${(err as Error).message}`);
      }
    });
  }
  return items;
}

/** `key | skill | label` lines grouped in one block per language file. */
export function buildTaxonomy(language: string, block: string): TaxonomyEntry[] {
  return lines(block).map((l) => {
    const [key, skill, label] = splitFields(l);
    return { key: key!, language, skill: skill as Skill, label: label! };
  });
}
