import type { ExerciseAnswer, ExercisePrompt } from "./types";

/** One-line human summaries of an exercise and its answer key (admin tables, reports). */
export function summarizeExercise(p: ExercisePrompt, a: ExerciseAnswer): { prompt: string; answer: string } {
  const prompt = (() => {
    switch (p.kind) {
      case "mc":
      case "listen":
        return `${p.question} [${p.options.join(" / ")}]`;
      case "fill":
        return p.sentence;
      case "order":
        return `Order: ${p.tokens.join(" · ")}`;
      case "match":
        return `Match ${p.left.length} pairs: ${p.left.slice(0, 3).join(", ")}…`;
      case "translate":
        return `${p.instruction}: ${p.source}`;
      case "short":
        return p.question;
      case "dictation":
        return `Dictation (${p.words} words)`;
      case "speak":
        return `${p.instruction}${p.text ? `: ${p.text}` : ""}`;
      case "write":
        return `${p.instruction} (≥ ${p.minWords} words)`;
    }
  })();
  const answer = (() => {
    switch (a.kind) {
      case "mc":
        return p.kind === "mc" || p.kind === "listen" ? (p.options[a.correct] ?? `#${a.correct}`) : `#${a.correct}`;
      case "fill":
        return a.blanks.map((b) => b.join(" | ")).join(" ; ");
      case "order":
        return a.sentences[0] ?? "";
      case "match":
        return p.kind === "match" ? p.left.map((l, i) => `${l} → ${p.right[a.pairs[i]!] ?? "?"}`).join(", ") : "";
      case "translate":
        return a.accepted.join(" | ");
      case "short":
        return a.accepted.length ? a.accepted.join(" | ") : `keywords: ${(a.keywords ?? []).map((k) => k.join("/")).join(" + ")}`;
      case "dictation":
        return a.text;
      case "speak":
        return a.target ?? `keywords: ${(a.keywords ?? []).map((k) => k.join("/")).join(" + ")}`;
      case "write":
        return a.model ?? "";
    }
  })();
  return { prompt, answer };
}
