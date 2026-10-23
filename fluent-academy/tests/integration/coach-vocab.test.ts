import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { endConversation, sendMessage, startConversation } from "@/server/coach/service";
import { reviewCard, saveWord } from "@/server/vocabulary/service";
import { createLearner } from "../helpers";

describe("AI coach in practice mode (no API key configured)", () => {
  it("runs a labelled practice conversation with rule-based corrections and a review", async () => {
    const { user } = await createLearner();
    const conv = await startConversation(user.id, { scenarioSlug: "introducing-yourself" });
    expect(conv.isPractice).toBe(true);
    expect(conv.provider).toBe("practice");
    const reply = await sendMessage(user.id, conv.id, "Bonjour ! Je m'appelle Sam et je suis 25 ans.");
    const corrections = JSON.stringify(reply);
    expect(corrections).toMatch(/j'ai 25 ans/i);
    await sendMessage(user.id, conv.id, "J'habite à Lyon et je parle anglais.");
    const review = await endConversation(user.id, conv.id);
    expect(review).toBeTruthy();
    const stored = await db.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(stored.status).toBe("ENDED");
  });

  it("limits free conversations per day", async () => {
    const { user } = await createLearner();
    await startConversation(user.id, { scenarioSlug: "introducing-yourself" });
    await startConversation(user.id, { scenarioSlug: "introducing-yourself" });
    await expect(startConversation(user.id, { scenarioSlug: "introducing-yourself" })).rejects.toMatchObject({ status: 402 });
  });
});

describe("vocabulary notebook", () => {
  it("deduplicates saved words and checks review answers on the server", async () => {
    const { user } = await createLearner();
    const a = await saveWord(user.id, { language: "fr", term: "Bonjour", translation: "hello", sourceType: "MANUAL" });
    const b = await saveWord(user.id, { language: "fr", term: "  bonjour ", translation: "hi", sourceType: "MANUAL" });
    expect(b.id).toBe(a.id);
    const wrong = await reviewCard(user.id, a.id, { mode: "RECALL", response: "goodbye" });
    expect(wrong.correct).toBe(false);
    const right = await reviewCard(user.id, a.id, { mode: "PRODUCTION", response: "bonjour" });
    expect(right.correct).toBe(true);
    expect(right.intervalDays).toBeGreaterThanOrEqual(1);
    expect(await db.vocabularyReview.count({ where: { userId: user.id } })).toBe(2);
  });
});
