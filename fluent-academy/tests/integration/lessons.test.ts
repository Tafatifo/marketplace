import { describe, expect, it } from "vitest";
import type { ExerciseAnswer, ExercisePrompt } from "@/content/types";
import { orderTokens } from "@/content/text";
import { db } from "@/server/db";
import { completeLesson, startLesson, submitAttempt } from "@/server/lessons/service";
import { consumeQuota } from "@/server/billing/quota";
import type { ResponsePayload } from "@/server/exercises/schemas";
import { createLearner } from "../helpers";

const SLUG = "fr-a1-u01-l01";

/** Builds the correct response from the answer key (speaking items are skipped: they need a recording). */
function correctResponse(prompt: ExercisePrompt, answer: ExerciseAnswer): ResponsePayload {
  switch (answer.kind) {
    case "mc": return { kind: "choice", choice: answer.correct };
    case "fill": return { kind: "blanks", values: answer.blanks.map((b) => b[0]!) };
    case "order": return { kind: "order", tokens: orderTokens(answer.sentences[0]!).tokens };
    case "match": return { kind: "match", pairs: answer.pairs };
    case "translate": return { kind: "text", text: answer.accepted[0]! };
    case "short": return { kind: "text", text: answer.accepted[0] ?? answer.keywords!.map((k) => k[0]).join(" ") };
    case "dictation": return { kind: "text", text: answer.text };
    case "write": return { kind: "text", text: `${answer.model} ${answer.model}` };
    case "speak": return { kind: "skip" };
  }
  void prompt;
}

async function exercisesOf(slug: string) {
  const lesson = await db.lesson.findUniqueOrThrow({ where: { slug }, include: { exercises: { where: { isActive: true }, orderBy: { order: "asc" } } } });
  return lesson.exercises;
}

describe("lesson engine", () => {
  it("validates answers on the server and never trusts the client's verdict", async () => {
    const { user } = await createLearner();
    const { sessionKey } = await startLesson(user.id, SLUG);
    const mc = (await exercisesOf(SLUG)).find((e) => e.type === "MULTIPLE_CHOICE")!;
    const answer = mc.answer as unknown as { correct: number };
    const wrong = await submitAttempt(user.id, mc.id, { kind: "choice", choice: (answer.correct + 1) % 3 }, { sessionKey, mode: "lesson" });
    expect(wrong.result.correct).toBe(false);
    expect(await db.exerciseReview.count({ where: { userId: user.id, exerciseId: mc.id } })).toBe(1); // mistakes deck
    const right = await submitAttempt(user.id, mc.id, { kind: "choice", choice: answer.correct }, { sessionKey, mode: "lesson" });
    expect(right.result.correct).toBe(true);
  });

  it("completes a lesson, awards XP once, and gives a smaller daily practice bonus on repeats", async () => {
    const { user } = await createLearner();
    const exercises = await exercisesOf(SLUG);
    let { sessionKey } = await startLesson(user.id, SLUG);
    for (const e of exercises) await submitAttempt(user.id, e.id, correctResponse(e.prompt as never, e.answer as never), { sessionKey, mode: "lesson" });
    const first = await completeLesson(user.id, SLUG, sessionKey);
    expect(first.passed).toBe(true);
    expect(first.firstCompletion).toBe(true);
    expect(first.score).toBe(1);
    expect(first.xp).toBe(30);

    ({ sessionKey } = await startLesson(user.id, SLUG));
    for (const e of exercises) await submitAttempt(user.id, e.id, correctResponse(e.prompt as never, e.answer as never), { sessionKey, mode: "lesson" });
    const again = await completeLesson(user.id, SLUG, sessionKey);
    expect(again.firstCompletion).toBe(false);
    expect(again.xp).toBe(5);

    ({ sessionKey } = await startLesson(user.id, SLUG));
    for (const e of exercises) await submitAttempt(user.id, e.id, correctResponse(e.prompt as never, e.answer as never), { sessionKey, mode: "lesson" });
    expect((await completeLesson(user.id, SLUG, sessionKey)).xp).toBe(0); // practice bonus once per day

    const progress = await db.lessonProgress.findFirstOrThrow({ where: { userId: user.id, lesson: { slug: SLUG } } });
    expect(progress.status).toBe("COMPLETED");
    const xp = await db.xpTransaction.aggregate({ where: { userId: user.id }, _sum: { amount: true } });
    expect(xp._sum.amount).toBe(35);
  });

  it("scores first attempts only, so retrying until correct cannot inflate the score", async () => {
    const { user } = await createLearner();
    const exercises = await exercisesOf(SLUG);
    const { sessionKey } = await startLesson(user.id, SLUG);
    const choices = exercises.filter((e) => e.type === "MULTIPLE_CHOICE");
    for (const e of exercises) {
      if (choices.includes(e)) {
        const correct = (e.answer as unknown as { correct: number }).correct;
        await submitAttempt(user.id, e.id, { kind: "choice", choice: (correct + 1) % 3 }, { sessionKey, mode: "lesson" });
      }
      await submitAttempt(user.id, e.id, correctResponse(e.prompt as never, e.answer as never), { sessionKey, mode: "lesson" });
    }
    const result = await completeLesson(user.id, SLUG, sessionKey);
    expect(result.score).toBeLessThan(1);
  });

  it("refuses to complete a lesson with unanswered exercises or a stale session", async () => {
    const { user } = await createLearner();
    const { sessionKey } = await startLesson(user.id, SLUG);
    await expect(completeLesson(user.id, SLUG, sessionKey)).rejects.toMatchObject({ status: 400 });
    await expect(completeLesson(user.id, SLUG, "not-the-session")).rejects.toMatchObject({ status: 400 });
  });

  it("keeps level assessments for Premium and enforces daily quotas", async () => {
    const free = await createLearner();
    await expect(startLesson(free.user.id, "fr-a1-assessment")).rejects.toMatchObject({ status: 402 });
    await consumeQuota(free.user.id, "ai_message", 2);
    await consumeQuota(free.user.id, "ai_message", 2);
    await expect(consumeQuota(free.user.id, "ai_message", 2)).rejects.toMatchObject({ status: 402 });
    await expect(consumeQuota(free.user.id, "ai_message", null)).resolves.not.toThrow();
  });
});
