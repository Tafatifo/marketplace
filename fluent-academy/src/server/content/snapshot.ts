import "server-only";
import { z } from "zod";
import { checkExercise, type Issue } from "@/content/qa";
import type { ExerciseDef } from "@/content/types";
import type { LessonSnapshot } from "./importer";

const audioRef = z.object({ key: z.string().min(3).max(200), slowKey: z.string().max(200).optional() }).strict();

const promptSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mc"), question: z.string().min(1), options: z.array(z.string().min(1)).min(2).max(8), context: z.string().optional(), audio: audioRef.optional() }),
  z.object({ kind: z.literal("fill"), sentence: z.string().includes("___"), blanks: z.number().int().min(1).max(6), hint: z.string().optional(), translation: z.string().optional() }),
  z.object({ kind: z.literal("order"), tokens: z.array(z.string().min(1)).min(3).max(25), prefix: z.string().optional(), suffix: z.string().optional(), translation: z.string().optional() }),
  z.object({ kind: z.literal("match"), left: z.array(z.string()).min(3).max(10), right: z.array(z.string()).min(3).max(10), instruction: z.string().optional() }),
  z.object({ kind: z.literal("translate"), source: z.string().min(1), instruction: z.string().min(1), from: z.string(), to: z.string() }),
  z.object({ kind: z.literal("short"), question: z.string().min(1), context: z.string().optional() }),
  z.object({ kind: z.literal("listen"), question: z.string().min(1), options: z.array(z.string().min(1)).min(2).max(8), audio: audioRef }),
  z.object({ kind: z.literal("dictation"), audio: audioRef, hint: z.string().optional(), words: z.number().int().min(1) }),
  z.object({ kind: z.literal("speak"), text: z.string().optional(), translation: z.string().optional(), instruction: z.string().min(1), audio: audioRef.optional(), mode: z.enum(["repeat", "respond"]) }),
  z.object({ kind: z.literal("write"), instruction: z.string().min(1), minWords: z.number().int().min(5).max(500), requirements: z.array(z.string()) }),
]);

const answerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mc"), correct: z.number().int().min(0), transcript: z.string().optional() }),
  z.object({ kind: z.literal("fill"), blanks: z.array(z.array(z.string().min(1)).min(1)).min(1) }),
  z.object({ kind: z.literal("order"), sentences: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal("match"), pairs: z.array(z.number().int().min(0)) }),
  z.object({ kind: z.literal("translate"), accepted: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal("short"), accepted: z.array(z.string()), keywords: z.array(z.array(z.string().min(1))).optional() }),
  z.object({ kind: z.literal("dictation"), text: z.string().min(1) }),
  z.object({ kind: z.literal("speak"), target: z.string().optional(), keywords: z.array(z.array(z.string())).optional(), model: z.string().optional() }),
  z.object({ kind: z.literal("write"), patterns: z.array(z.string()), model: z.string().optional() }),
]);

const exerciseSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/).max(80),
  order: z.number().int().min(0),
  type: z.enum(["MULTIPLE_CHOICE", "FILL_BLANK", "SENTENCE_ORDER", "MATCHING", "TRANSLATION", "SHORT_ANSWER", "LISTENING", "DICTATION", "SPEAKING", "WRITING"]),
  skill: z.enum(["grammar", "vocabulary", "reading", "listening", "speaking", "writing", "translation", "pronunciation"]),
  prompt: promptSchema,
  answer: answerSchema,
  explanation: z.string().min(3),
  tags: z.array(z.string().max(120)),
  objective: z.string().optional(),
  points: z.number().int().min(1).max(100),
  derived: z.boolean(),
});

export const snapshotSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(600),
  minutes: z.number().int().min(5).max(120),
  skills: z.array(z.string()),
  objectives: z.array(z.string().min(1)),
  grammarTags: z.array(z.string()),
  kind: z.enum(["LESSON", "UNIT_REVIEW", "LEVEL_ASSESSMENT"]),
  content: z.object({ blocks: z.array(z.object({ type: z.string() }).passthrough()) }),
  exercises: z.array(exerciseSchema).min(1).max(80),
});

/** Validates an edited lesson snapshot: structure first, then the same semantic checks as content QA. */
export function validateSnapshot(input: unknown): { ok: true; snapshot: LessonSnapshot; warnings: Issue[] } | { ok: false; issues: Issue[] } {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.slice(0, 30).map((i) => ({ severity: "error" as const, where: i.path.join("."), message: i.message })) };
  }
  const snap = parsed.data as unknown as LessonSnapshot;
  const issues: Issue[] = [];
  const keys = new Set<string>();
  for (const e of snap.exercises as ExerciseDef[]) {
    if (keys.has(e.key)) issues.push({ severity: "error", where: e.key, message: "duplicate exercise key" });
    keys.add(e.key);
    issues.push(...checkExercise(e));
  }
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length) return { ok: false, issues: errors };
  return { ok: true, snapshot: snap, warnings: issues };
}
