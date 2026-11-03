import { describe, expect, it } from "vitest";
import { parseExerciseLine, parseOptions, parseVocabLine } from "@/content/dsl";
import { loadContent } from "@/content/load";
import { checkExercise, checkLesson } from "@/content/qa";
import { normalizeAnswer, orderTokens, seededShuffle } from "@/content/text";
import type { ExerciseDef } from "@/content/types";

const bundle = loadContent();
const lessons = bundle.courses.flatMap((c) => c.units.flatMap((u) => u.lessons.map((l) => ({ l, lang: c.language }))));
const exercises = lessons.flatMap(({ l }) => l.exercises);

describe("exercise DSL", () => {
  it("splits fields, options and several attributes in one field", () => {
    const raw = parseExerciseLine("mc: Q? || a | *b | c || Because. || @tags fr.etre @skill grammar");
    expect(raw.fields).toEqual(["Q?", "a | *b | c", "Because."]);
    expect(raw.attrs).toEqual({ tags: "fr.etre", skill: "grammar" });
    expect(parseOptions(raw.fields[1]!, raw.source)).toEqual({ options: ["a", "b", "c"], correct: 1 });
  });
  it("rejects malformed items instead of guessing", () => {
    expect(() => parseExerciseLine("quiz: what?")).toThrow(/Unknown exercise type/);
    expect(() => parseOptions("a | b", "x")).toThrow(/No correct option/);
    expect(() => parseOptions("*a | *b", "x")).toThrow(/Multiple correct/);
    expect(() => parseOptions("*a | a", "x")).toThrow(/Duplicate/);
  });
  it("parses vocabulary lines with optional fields", () => {
    const v = parseVocabLine("madame | madam; Mrs | n | Bonjour, madame. | Hello, madam. | g: f | n: Polite.");
    expect(v.term).toBe("madame");
    expect(v.gender).toBe("f");
    expect(v.note).toBe("Polite.");
  });
  it("keeps the punctuation of order items attached so the sentence can be rebuilt", () => {
    const { tokens } = orderTokens("Très bien, merci. Et vous ?");
    expect(normalizeAnswer(tokens.join(" "))).toBe(normalizeAnswer("Très bien, merci. Et vous ?"));
  });
  it("shuffles deterministically", () => {
    expect(seededShuffle([1, 2, 3, 4, 5], "k")).toEqual(seededShuffle([1, 2, 3, 4, 5], "k"));
    expect(seededShuffle([1, 2, 3, 4, 5], "k")).not.toEqual([1, 2, 3, 4, 5]);
  });
});

describe("content QA rules", () => {
  const base: ExerciseDef = {
    key: "t-1", order: 1, type: "MULTIPLE_CHOICE", skill: "grammar", explanation: "Because.", tags: [], points: 10, derived: false,
    prompt: { kind: "mc", question: "?", options: ["a", "b"] }, answer: { kind: "mc", correct: 1 },
  };
  it("accepts a valid item and catches broken answer keys", () => {
    expect(checkExercise(base)).toEqual([]);
    expect(checkExercise({ ...base, answer: { kind: "mc", correct: 5 } })[0]?.message).toMatch(/out of range/);
    expect(checkExercise({ ...base, prompt: { kind: "mc", question: "?", options: ["a", "A"] } })[0]?.message).toMatch(/duplicate/);
    expect(checkExercise({ ...base, type: "FILL_BLANK", prompt: { kind: "fill", sentence: "x ___ ___", blanks: 2 }, answer: { kind: "fill", blanks: [["a"]] } })[0]?.message).toMatch(/2 blanks but 1/);
    expect(checkExercise({ ...base, explanation: "" })[0]?.message).toMatch(/explanation/);
  });
});

describe("curriculum in /content", () => {
  it("loads without errors", () => {
    expect(bundle.errors).toEqual([]);
    expect(bundle.courses.length).toBeGreaterThan(0);
  });
  it("passes lesson QA with no errors", () => {
    const errors = lessons.flatMap(({ l, lang }) => checkLesson(l, lang).filter((i) => i.severity === "error"));
    expect(errors).toEqual([]);
  });
  it("uses unique exercise keys", () => {
    const keys = exercises.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("only uses taxonomy tags that exist", () => {
    const known = new Set(bundle.taxonomy.map((t) => t.key));
    const unknown = [...new Set(exercises.flatMap((e) => e.tags).filter((t) => !/^(vocab|pron)\./.test(t) && !known.has(t)))];
    expect(unknown).toEqual([]);
  });
  it("does not cluster multiple-choice answers on one position", () => {
    const mc = exercises.filter((e) => e.answer.kind === "mc" && (e.prompt.kind === "mc" || e.prompt.kind === "listen") && e.prompt.options.length === 3);
    const counts = [0, 0, 0];
    for (const e of mc) counts[(e.answer as { correct: number }).correct]!++;
    for (const c of counts) expect(c / mc.length).toBeLessThan(0.5);
  });
  it("references audio for every listening, dictation and repeat item", () => {
    for (const e of exercises) {
      if (e.prompt.kind === "listen" || e.prompt.kind === "dictation") expect(e.prompt.audio?.key, e.key).toBeTruthy();
      if (e.prompt.kind === "speak" && e.prompt.mode === "repeat") expect(e.prompt.audio?.key, e.key).toBeTruthy();
    }
  });
});
