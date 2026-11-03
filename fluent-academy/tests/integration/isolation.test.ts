import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { endConversation, sendMessage, startConversation } from "@/server/coach/service";
import { resolveResponse } from "@/server/lessons/service";
import { deleteAttemptAudio } from "@/server/speech/service";
import { reviewCard, saveWord } from "@/server/vocabulary/service";
import { setWeaknessDismissed } from "@/server/learner-model/observations";
import { createLearner } from "../helpers";

describe("private learning records", () => {
  it("prevents one learner from reading or changing another learner's records", async () => {
    const alice = await createLearner();
    const bob = await createLearner();

    const card = await saveWord(alice.user.id, { language: "fr", term: "bonjour", translation: "hello", sourceType: "MANUAL" });
    await expect(reviewCard(bob.user.id, card.id, { mode: "RECALL", response: "hello" })).rejects.toMatchObject({ status: 404 });

    const conv = await startConversation(alice.user.id, { scenarioSlug: "introducing-yourself" });
    await expect(sendMessage(bob.user.id, conv.id, "Bonjour")).rejects.toMatchObject({ status: 404 });
    await expect(endConversation(bob.user.id, conv.id)).rejects.toMatchObject({ status: 404 });

    const attempt = await db.speakingAttempt.create({
      data: { userId: alice.user.id, languageCode: "fr", context: "FREE", provider: "mock", assessmentType: "TRANSCRIPT_COMPARISON", isSimulated: true, transcript: "bonjour", words: [], feedback: {} },
    });
    await expect(resolveResponse(bob.user.id, { kind: "speech", attemptId: attempt.id })).rejects.toMatchObject({ status: 400 });
    await deleteAttemptAudio(bob.user.id, attempt.id);
    expect(await db.speakingAttempt.findUnique({ where: { id: attempt.id } })).not.toBeNull();

    const weakness = await db.learnerWeakness.create({ data: { userId: alice.user.id, languageCode: "fr", category: "fr.etre", skill: "grammar", label: "The verb être", status: "ACTIVE" } });
    expect(await setWeaknessDismissed(bob.user.id, weakness.id, true)).toBeNull();
    expect((await db.learnerWeakness.findUniqueOrThrow({ where: { id: weakness.id } })).status).toBe("ACTIVE");
  });
});
