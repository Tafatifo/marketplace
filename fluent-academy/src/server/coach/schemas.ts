import { z } from "zod";

export const correctionSchema = z.object({
  original: z.string().describe("The learner's exact words that contain the mistake"),
  corrected: z.string().describe("The corrected version, in the target language"),
  explanation: z.string().describe("A short explanation in the explanation language"),
  category: z.string().describe("One taxonomy key from the provided list, or 'other'"),
  severity: z.enum(["minor", "important"]),
});

export const tutorTurnSchema = z.object({
  reply: z.string().describe("Your in-character reply, only in the target language"),
  replyTranslation: z.string().describe("A natural translation of the reply in the explanation language"),
  corrections: z.array(correctionSchema).describe("Corrections of the learner's last message, following the correction mode"),
  vocabulary: z
    .array(z.object({ term: z.string(), translation: z.string() }))
    .describe("0–3 useful words or phrases you introduced in this reply"),
  hint: z.string().describe("A short suggestion, in the target language, of something the learner could say next"),
  goalsCompleted: z.array(z.number().int()).describe("Indices (0-based) of scenario goals the learner has achieved so far"),
});
export type TutorTurn = z.infer<typeof tutorTurnSchema>;

export const reviewSchema = z.object({
  summary: z.string().describe("2–3 sentences summarising the conversation and the learner's performance, in the explanation language"),
  strengths: z.array(z.string()).describe("1–3 specific things the learner did well"),
  keyMistakes: z.array(correctionSchema).describe("The most important recurring or meaning-changing mistakes (max 6)"),
  correctedSentences: z.array(z.object({ original: z.string(), corrected: z.string() })).describe("Up to 6 learner sentences rewritten naturally"),
  newVocabulary: z.array(z.object({ term: z.string(), translation: z.string(), example: z.string() })).describe("Up to 8 useful words or phrases from the conversation"),
  grammarPatterns: z.array(z.object({ pattern: z.string(), explanation: z.string(), category: z.string() })).describe("Up to 4 grammar points to review"),
  recommendedCategories: z.array(z.string()).describe("Taxonomy keys the learner should practise next"),
  suggestedNextScenario: z.string().describe("The slug of one scenario from the provided list"),
  difficultyAdjustment: z.enum(["easier", "same", "harder"]).describe("Whether the next conversation should be easier, the same, or harder"),
});
export type SessionReview = z.infer<typeof reviewSchema>;
