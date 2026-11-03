import { z } from "zod";

/** Validation for a learner's response payload (never trusted beyond its shape). */
export const responseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), choice: z.number().int().min(0).max(20) }),
  z.object({ kind: z.literal("blanks"), values: z.array(z.string().max(200)).max(10) }),
  z.object({ kind: z.literal("order"), tokens: z.array(z.string().max(100)).max(40) }),
  z.object({ kind: z.literal("match"), pairs: z.array(z.number().int().min(-1).max(30)).max(30) }),
  z.object({ kind: z.literal("text"), text: z.string().max(4000) }),
  z.object({ kind: z.literal("speech"), attemptId: z.string().max(40) }),
  z.object({ kind: z.literal("skip"), reason: z.string().max(60).optional() }),
]);

export type ResponsePayload = z.infer<typeof responseSchema>;

/** Responses that can be validated without a recording (placement, assessments). */
export const writtenResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), choice: z.number().int().min(0).max(20) }),
  z.object({ kind: z.literal("blanks"), values: z.array(z.string().max(200)).max(10) }),
  z.object({ kind: z.literal("order"), tokens: z.array(z.string().max(100)).max(40) }),
  z.object({ kind: z.literal("match"), pairs: z.array(z.number().int().min(-1).max(30)).max(30) }),
  z.object({ kind: z.literal("text"), text: z.string().max(4000) }),
  z.object({ kind: z.literal("skip"), reason: z.string().max(60).optional() }),
]);
