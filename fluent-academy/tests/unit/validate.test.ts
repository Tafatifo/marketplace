import { describe, expect, it } from "vitest";
import { compareText, validateResponse } from "@/lib/validate";

describe("compareText", () => {
  it("accepts exact answers regardless of case, spacing and punctuation", () => {
    expect(compareText("  bonjour, MADAME ! ", ["Bonjour, madame !"], "fr").level).toBe("exact");
  });
  it("distinguishes missing accents from correct answers", () => {
    expect(compareText("tres bien", ["très bien"], "fr").level).toBe("accents");
  });
  it("tolerates a single typo only on longer answers", () => {
    expect(compareText("Je m'apelle Marie", ["Je m'appelle Marie"], "fr").level).toBe("typo");
    expect(compareText("ont", ["ans"], "fr").level).toBe("none");
  });
  it("can disable typo tolerance (used for grammar blanks)", () => {
    expect(compareText("Je m'apelle Marie", ["Je m'appelle Marie"], "fr", false).level).toBe("none");
  });
  it("expands English contractions", () => {
    expect(compareText("I don't speak German", ["I do not speak German"], "en").level).toBe("exact");
  });
});

describe("validateResponse", () => {
  it("scores multiple choice on the server-side key", () => {
    const prompt = { kind: "mc" as const, question: "?", options: ["a", "b", "c"] };
    expect(validateResponse(prompt, { kind: "mc", correct: 1 }, { kind: "choice", choice: 1 }, "fr").correct).toBe(true);
    const wrong = validateResponse(prompt, { kind: "mc", correct: 1 }, { kind: "choice", choice: 2 }, "fr");
    expect(wrong.correct).toBe(false);
    expect(wrong.expected).toBe("b");
  });

  it("gives partial credit for blanks and flags accent slips", () => {
    const prompt = { kind: "fill" as const, sentence: "Je ___ et tu ___.", blanks: 2 };
    const answer = { kind: "fill" as const, blanks: [["suis"], ["es"]] };
    const half = validateResponse(prompt, answer, { kind: "blanks", values: ["suis", "est"] }, "fr");
    expect(half.correct).toBe(false);
    expect(half.score).toBe(0.5);
    const accents = validateResponse(
      { kind: "fill", sentence: "Il ___ .", blanks: 1 },
      { kind: "fill", blanks: [["a été"]] },
      { kind: "blanks", values: ["a ete"] },
      "fr",
    );
    expect(accents.status).toBe("almost");
  });

  it("checks sentence order including the prefix and suffix", () => {
    const prompt = { kind: "order" as const, tokens: ["bien,", "Très", "merci."] };
    const answer = { kind: "order" as const, sentences: ["Très bien, merci."] };
    expect(validateResponse(prompt, answer, { kind: "order", tokens: ["Très", "bien,", "merci."] }, "fr").correct).toBe(true);
    expect(validateResponse(prompt, answer, { kind: "order", tokens: ["merci.", "Très", "bien,"] }, "fr").correct).toBe(false);
  });

  it("counts matched pairs", () => {
    const prompt = { kind: "match" as const, left: ["a", "b", "c"], right: ["1", "2", "3"] };
    const r = validateResponse(prompt, { kind: "match", pairs: [2, 0, 1] }, { kind: "match", pairs: [2, 1, 0] }, "fr");
    expect(r.score).toBeCloseTo(1 / 3);
  });

  it("accepts any listed translation and reports small slips as almost", () => {
    const prompt = { kind: "translate" as const, source: "See you tomorrow", instruction: "Translate", from: "en", to: "fr" };
    const answer = { kind: "translate" as const, accepted: ["À demain !", "À demain."] };
    expect(validateResponse(prompt, answer, { kind: "text", text: "à demain" }, "fr").status).toBe("correct");
    expect(validateResponse(prompt, answer, { kind: "text", text: "a demain" }, "fr").status).toBe("almost");
    expect(validateResponse(prompt, answer, { kind: "text", text: "bonne nuit" }, "fr").correct).toBe(false);
  });

  it("requires every keyword group for comprehension answers", () => {
    const prompt = { kind: "short" as const, question: "How does Thomas feel?" };
    const answer = { kind: "short" as const, accepted: [], keywords: [["tired", "fatigué"]] };
    expect(validateResponse(prompt, answer, { kind: "text", text: "He is tired" }, "fr").correct).toBe(true);
    expect(validateResponse(prompt, answer, { kind: "text", text: "He is happy" }, "fr").correct).toBe(false);
  });

  it("scores dictation by aligned words", () => {
    const prompt = { kind: "dictation" as const, audio: { key: "x.mp3" }, words: 4 };
    const r = validateResponse(prompt, { kind: "dictation", text: "Je suis très fatigué" }, { kind: "text", text: "je suis fatigué" }, "fr");
    expect(r.correct).toBe(false);
    expect(r.score).toBe(0.75);
    expect(r.alignment?.words.find((w) => w.word === "très")?.status).toBe("missing");
  });

  it("labels speaking feedback as transcript comparison, not a pronunciation score", () => {
    const prompt = { kind: "speak" as const, text: "Bonjour madame", instruction: "Repeat", mode: "repeat" as const, audio: { key: "x.mp3" } };
    const r = validateResponse(prompt, { kind: "speak", target: "Bonjour madame" }, { kind: "speech", transcript: "bonjour madame" }, "fr");
    expect(r.correct).toBe(true);
    expect(r.notes.join(" ")).toMatch(/not a phonetic pronunciation score/);
    const silent = validateResponse(prompt, { kind: "speak", target: "Bonjour madame" }, { kind: "speech", transcript: "" }, "fr");
    expect(silent.correct).toBe(false);
  });

  it("checks writing length and required phrases, and says it cannot judge grammar", () => {
    const prompt = { kind: "write" as const, instruction: "Write", minWords: 8, requirements: [] };
    const answer = { kind: "write" as const, patterns: ["salut/coucou", "à demain"], model: "Salut ! À demain !" };
    const short = validateResponse(prompt, answer, { kind: "text", text: "Salut ! À demain !" }, "fr");
    expect(short.correct).toBe(false);
    expect(short.message).toMatch(/at least 8 words/);
    const good = validateResponse(prompt, answer, { kind: "text", text: "Salut Marc ! Ça va ? Moi ça va bien. À demain !" }, "fr");
    expect(good.correct).toBe(true);
    expect(good.notes[0]).toMatch(/can't judge grammar/);
  });

  it("treats skipped items as not scored", () => {
    const r = validateResponse({ kind: "short", question: "?" }, { kind: "short", accepted: ["x"] }, { kind: "skip" }, "fr");
    expect(r.status).toBe("skipped");
  });
});
