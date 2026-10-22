/**
 * Normalised curriculum types shared by the content pipeline (scripts/content)
 * and the application server. Authoring files live in /content and are parsed
 * into these shapes by src/content/parse.ts.
 */

export const COURSE_LANGUAGES = ["en", "fr", "es", "de"] as const;
export type CourseLanguage = (typeof COURSE_LANGUAGES)[number];

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2"] as const;
export type CefrCode = (typeof CEFR_LEVELS)[number];

export type ExerciseTypeName =
  | "MULTIPLE_CHOICE"
  | "FILL_BLANK"
  | "SENTENCE_ORDER"
  | "MATCHING"
  | "TRANSLATION"
  | "SHORT_ANSWER"
  | "LISTENING"
  | "DICTATION"
  | "SPEAKING"
  | "WRITING";

export type Skill =
  | "grammar"
  | "vocabulary"
  | "reading"
  | "listening"
  | "speaking"
  | "writing"
  | "translation"
  | "pronunciation";

export interface AudioRef {
  key: string; // relative storage key, e.g. fr/siwis/3f/3f2a9c1b7d4e.mp3
  slowKey?: string;
}

export interface VocabEntry {
  key: string;
  term: string;
  gloss: string; // English translation, or English definition for the English course
  pos?: string;
  gender?: string;
  plural?: string;
  example: string;
  exampleTranslation?: string;
  collocations: string[];
  note?: string;
  translations?: Record<string, string>;
  audio?: AudioRef;
  exampleAudio?: AudioRef;
  ipa?: string;
}

export interface ExampleSentence {
  text: string;
  translation?: string;
  note?: string;
  audio?: AudioRef;
}

export interface DialogueLine {
  speaker: string; // speaker id
  text: string;
  translation?: string;
  audio?: AudioRef;
}

export interface Speaker {
  id: string;
  name: string;
  gender: "f" | "m";
}

export type LessonBlock =
  | { type: "intro"; title: string; body: string }
  | { type: "vocabulary"; title: string; items: VocabEntry[] }
  | {
      type: "grammar";
      title: string;
      body: string; // markdown
      table?: { head: string[]; rows: string[][] };
      examples: ExampleSentence[];
      tip?: string;
    }
  | {
      type: "dialogue";
      title: string;
      setting?: string;
      speakers: Speaker[];
      lines: DialogueLine[];
    }
  | { type: "reading"; title: string; text: string; translation?: string; audio?: AudioRef }
  | {
      type: "pronunciation";
      title: string;
      body: string;
      items: { text: string; ipa?: string; audio?: AudioRef }[];
    }
  | { type: "culture"; title: string; body: string }
  | { type: "mistakes"; title: string; items: { wrong: string; right: string; why: string }[] }
  | { type: "task"; title: string; body: string; mode: "speaking" | "writing" | "interaction" }
  | { type: "summary"; title: string; points: string[] }
  | { type: "cando"; title: string; items: string[] };

export interface LessonContent {
  blocks: LessonBlock[];
}

/** Public payload of an exercise (safe to send to the browser). */
export type ExercisePrompt =
  | { kind: "mc"; question: string; options: string[]; context?: string; audio?: AudioRef }
  | { kind: "fill"; sentence: string; blanks: number; hint?: string; translation?: string }
  | { kind: "order"; tokens: string[]; prefix?: string; suffix?: string; translation?: string }
  | { kind: "match"; left: string[]; right: string[]; instruction?: string }
  | { kind: "translate"; source: string; instruction: string; from: string; to: string }
  | { kind: "short"; question: string; context?: string }
  | { kind: "listen"; question: string; options: string[]; audio: AudioRef }
  | { kind: "dictation"; audio: AudioRef; hint?: string; words: number }
  | { kind: "speak"; text?: string; translation?: string; instruction: string; audio?: AudioRef; mode: "repeat" | "respond" }
  | { kind: "write"; instruction: string; minWords: number; requirements: string[] };

/** Server-only answer key. */
export type ExerciseAnswer =
  | { kind: "mc"; correct: number; transcript?: string }
  | { kind: "fill"; blanks: string[][] }
  | { kind: "order"; sentences: string[] }
  | { kind: "match"; pairs: number[] }
  | { kind: "translate"; accepted: string[] }
  | { kind: "short"; accepted: string[]; keywords?: string[][] }
  | { kind: "dictation"; text: string }
  | { kind: "speak"; target?: string; keywords?: string[][]; model?: string }
  | { kind: "write"; patterns: string[]; model?: string };

export interface ExerciseDef {
  key: string;
  order: number;
  type: ExerciseTypeName;
  skill: Skill;
  prompt: ExercisePrompt;
  answer: ExerciseAnswer;
  explanation: string;
  tags: string[];
  objective?: string;
  points: number;
  derived: boolean;
}

export type LessonKindName = "LESSON" | "UNIT_REVIEW" | "LEVEL_ASSESSMENT";

export interface LessonDef {
  slug: string;
  unitSlug: string;
  order: number;
  kind: LessonKindName;
  title: string;
  summary: string;
  minutes: number;
  skills: string[];
  objectives: string[];
  grammarTags: string[];
  content: LessonContent;
  exercises: ExerciseDef[];
  vocab: VocabEntry[];
  sourceHash: string;
}

export interface UnitDef {
  slug: string;
  order: number;
  title: string;
  description: string;
  theme: string;
  objectives: string[];
  canDo: string[];
  isFree: boolean;
  lessons: LessonDef[];
}

export interface PlannedUnit {
  order: number;
  title: string;
  theme: string;
  lessons: string[]; // planned lesson titles
}

export interface CourseSyllabus {
  hours: number;
  summary: string;
  objectives: string[];
  canDo: Record<string, string[]>; // by CEFR scale (listening, reading, spokenInteraction, ...)
  grammar: string[];
  vocabularyDomains: string[];
  assessment: string;
  plannedUnits: PlannedUnit[];
}

export interface CourseDef {
  slug: string;
  language: CourseLanguage;
  level: CefrCode;
  title: string;
  description: string;
  syllabus: CourseSyllabus;
  units: UnitDef[];
  sourceHash: string;
}

export interface QuestionDef {
  id: string;
  prompt: ExercisePrompt;
  answer: ExerciseAnswer;
  explanation: string;
  type: ExerciseTypeName;
}

export interface PassageDef {
  slug: string;
  language: CourseLanguage;
  level: CefrCode;
  kind: "READING" | "LISTENING";
  title: string;
  summary: string;
  topic: string;
  body: string;
  translation?: string;
  speakers?: Speaker[];
  wordCount: number;
  minutes: number;
  glossary: { term: string; translation: string; note?: string }[];
  questions: QuestionDef[];
  audio?: AudioRef;
  lineAudio?: AudioRef[];
  isFree: boolean;
  sourceHash: string;
}

export interface ScenarioTurn {
  tutor: string;
  translation?: string;
  hint: string; // what the learner is expected to do, in English
  expect?: string[]; // keywords suggesting the learner addressed the turn
}

export interface ScenarioDef {
  slug: string;
  title: string;
  description: string;
  minLevel: CefrCode;
  maxLevel: CefrCode;
  category: string;
  goals: string[];
  focusTags: string[];
  roles: { tutor: string; learner: string };
  isFree: boolean;
  order: number;
  perLanguage: Record<
    string,
    { opener: string; openerTranslation?: string; vocabulary: { term: string; translation: string }[]; script: ScenarioTurn[] }
  >;
}

export interface PlacementItemDef {
  key: string;
  language: CourseLanguage;
  level: CefrCode;
  skill: Skill;
  order: number;
  prompt: ExercisePrompt;
  answer: ExerciseAnswer;
  explanation: string;
}

export interface TaxonomyEntry {
  key: string;
  language: string;
  skill: Skill;
  label: string;
}

export interface AudioRequest {
  key: string;
  language: string;
  text: string;
  voice: string;
  speed: "normal" | "slow";
  /** Where the clip is used (for QA reports). */
  usage: string;
}

export interface ContentBundle {
  courses: CourseDef[];
  passages: PassageDef[];
  scenarios: ScenarioDef[];
  placement: PlacementItemDef[];
  taxonomy: TaxonomyEntry[];
  audio: AudioRequest[];
  errors: string[];
}
