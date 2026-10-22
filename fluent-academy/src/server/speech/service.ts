import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, SpeakingAttempt } from "@prisma/client";
import { alignWords, type Alignment } from "@/lib/align";
import { db } from "../db";
import { env } from "../env";
import { badRequest, HttpError } from "../http";
import { logger } from "../logger";
import { enforceRateLimit } from "../rate-limit";
import { recordingStore } from "../storage";
import { consumeQuota } from "../billing/quota";
import { entitlementFor } from "../learner";
import { awardXp, recordActivity } from "../progress/activity";
import { recordObservations } from "../learner-model/observations";
import { sniffAudio } from "./audio";
import { PROVIDER_LABEL, serverRecognizer } from "./config";
import { getPronunciationAssessor, getRecognizer, type PronunciationResult, type RecognizedWord } from "./providers";

const log = logger("speech");

export interface NewAttemptInput {
  audio: Buffer;
  language: string;
  targetText?: string;
  context: "SENTENCE" | "EXERCISE" | "FREE" | "CONVERSATION";
  sourceId?: string;
  browserTranscript?: string;
  durationMs?: number;
  mockTranscript?: string;
}

const CAVEAT =
  "This feedback is based on automatic speech recognition. It shows which words were understood — a useful measure of intelligibility — but it is not a phonetic pronunciation score. Accents, background noise and microphone quality all affect recognition.";

function buildFeedback(alignment: Alignment | null, pron: PronunciationResult | null, transcript: string) {
  const tips: string[] = [];
  if (pron) {
    const weak = pron.words.filter((w) => w.errorType !== "None" || w.accuracy < 60).slice(0, 4);
    for (const w of weak) {
      tips.push(
        w.errorType === "Omission"
          ? `“${w.word}” wasn't detected — make sure you say every word.`
          : w.errorType === "Insertion"
            ? `An extra word (“${w.word}”) was detected.`
            : `“${w.word}” scored ${Math.round(w.accuracy)}/100 for accuracy — listen to the model and repeat it slowly.`,
      );
    }
    return {
      summary: `Pronunciation ${Math.round(pron.overall)}/100 · accuracy ${Math.round(pron.accuracy)} · fluency ${Math.round(pron.fluency)} · completeness ${Math.round(pron.completeness)}${pron.prosody !== undefined ? ` · prosody ${Math.round(pron.prosody)}` : ""}.`,
      tips: tips.length ? tips : ["Every word was assessed as acceptable. Try it at a more natural speed next time."],
      caveat: "Scores come from Azure AI Speech pronunciation assessment. They are automated estimates against a native-speaker model and can be affected by recording quality.",
    };
  }
  if (!alignment) {
    return {
      summary: transcript ? `We heard: “${transcript}”.` : "Recording saved. Replay it and compare it with the model audio.",
      tips: ["Listen to the model, record again, and compare the two recordings yourself."],
      caveat: CAVEAT,
    };
  }
  const total = alignment.words.length;
  const ok = alignment.words.filter((w) => w.status === "match" || w.status === "close").length;
  for (const w of alignment.words) {
    if (tips.length >= 4) break;
    if (w.status === "substituted") tips.push(`“${w.word}” was recognised as “${w.heard}”. This may point to a sound worth practising — or to a recognition error.`);
    else if (w.status === "missing") tips.push(`“${w.word}” wasn't recognised. Make sure it is clearly audible.`);
    else if (w.status === "close") tips.push(`“${w.word}” was recognised as the close form “${w.heard}”. Check the ending or vowel.`);
  }
  return {
    summary: total === 0 ? "No target sentence." : ok === total ? `All ${total} words were recognised.` : `${ok} of ${total} words were recognised.`,
    tips: tips.length ? tips : ["Everything was recognised. Try saying it a little faster, as you would in conversation."],
    caveat: CAVEAT,
  };
}

/** Records, transcribes and (where supported) assesses a learner recording. */
export async function createSpeakingAttempt(userId: string, input: NewAttemptInput) {
  const e = env();
  if (input.audio.length > e.MAX_UPLOAD_BYTES) throw new HttpError(413, "payload_too_large", "Recording is too large (5 MB maximum). Keep recordings under a minute.");
  const sniff = sniffAudio(input.audio);
  if (!sniff) throw badRequest("Unsupported audio format. Please record again.");
  if (input.targetText && input.targetText.length > 500) throw badRequest("Target text is too long.");

  await enforceRateLimit(`speech:${userId}`, 30, 300, "You're recording very quickly — wait a moment and try again.");
  const ent = await entitlementFor(userId);
  await consumeQuota(userId, "speech_attempt", ent.plan.limits.speakingAttemptsPerDay);

  const prefs = await db.userPreferences.findUnique({ where: { userId } });
  const retain = prefs?.retainRecordings ?? true;
  const retentionDays = Math.min(prefs?.recordingRetentionDays ?? e.RECORDING_RETENTION_DAYS, e.RECORDING_RETENTION_DAYS || 365);

  const recognizer = serverRecognizer();
  let transcript = "";
  let words: RecognizedWord[] = [];
  let provider = recognizer ?? (input.browserTranscript ? "browser" : "none");
  let pron: PronunciationResult | null = null;
  const assessor = input.targetText ? getPronunciationAssessor() : null;

  try {
    if (assessor && input.targetText) {
      pron = await assessor.assess(input.audio, input.language, input.targetText);
      transcript = pron.recognizedText;
      words = pron.words.filter((w) => w.start !== undefined).map((w) => ({ word: w.word, start: w.start!, end: w.end!, confidence: w.accuracy / 100 }));
      provider = "azure";
    } else if (recognizer) {
      const r = await getRecognizer(recognizer).transcribe(input.audio, sniff.mime, input.language, { mockTranscript: input.mockTranscript });
      transcript = r.text.trim();
      words = r.words;
    } else if (input.browserTranscript) {
      transcript = input.browserTranscript.trim().slice(0, 1000);
    }
  } catch (err) {
    log.error("Speech recognition failed", { provider, error: err });
    throw new HttpError(502, "speech_unavailable", "Speech recognition is temporarily unavailable. Your recording wasn't scored — please try again in a moment.");
  }

  const hasRecognition = provider !== "none";
  const alignment = hasRecognition && input.targetText ? alignWords(input.targetText, transcript, input.language) : null;
  const matchScore = alignment ? Math.round(alignment.matchRatio * 100) / 100 : null;
  const feedback = buildFeedback(alignment, pron, transcript);
  const assessmentType = pron ? "PRONUNCIATION_ASSESSMENT" : hasRecognition ? "TRANSCRIPT_COMPARISON" : "SELF_REVIEW";

  const id = randomUUID().replace(/-/g, "").slice(0, 24);
  let audioKey: string | null = null;
  if (retain) {
    audioKey = `${userId}/${id}.${sniff.ext}`;
    await recordingStore().put(audioKey, input.audio);
  }

  const attempt = await db.speakingAttempt.create({
    data: {
      id,
      userId,
      languageCode: input.language,
      targetText: input.targetText ?? null,
      context: input.context,
      sourceId: input.sourceId ?? null,
      audioKey,
      audioMimeType: sniff.mime,
      audioBytes: input.audio.length,
      durationMs: input.durationMs ?? null,
      transcript,
      provider,
      assessmentType,
      isSimulated: provider === "mock",
      matchScore,
      pronunciation: pron ? (pron as unknown as Prisma.InputJsonValue) : undefined,
      words: { alignment, timings: words } as unknown as Prisma.InputJsonValue,
      feedback: feedback as unknown as Prisma.InputJsonValue,
      audioExpiresAt: audioKey ? new Date(Date.now() + retentionDays * 86_400_000) : null,
    },
  });

  if (hasRecognition) {
    await recordActivity(userId, { speakingAttempts: 1 });
    // Free practice sentences (not lesson exercises) feed the learner model directly.
    if (alignment && input.context !== "EXERCISE") {
      await recordObservations(
        userId,
        input.language,
        alignment.words
          .map((w) => ({ w, key: w.word.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "") }))
          .filter(({ key }) => key.length >= 3)
          .map(({ w, key }) => ({
            skill: "pronunciation",
            category: `pron.${key}`,
            outcome: w.status === "match" || w.status === "close" ? ("SUCCESS" as const) : ("ERROR" as const),
            evidence: w.heard ? `heard “${w.heard}”` : w.status === "missing" ? "not recognised" : undefined,
            source: "SPEAKING" as const,
            sourceId: attempt.id,
            confidence: pron ? 0.8 : 0.5,
            label: { word: w.word },
          })),
      );
    }
    // Up to 20 XP a day from speaking practice, only for clearly understood sentences.
    if (input.context === "SENTENCE" && (matchScore ?? 0) >= 0.7) {
      const today = await db.xpTransaction.aggregate({ where: { userId, reason: "SPEAKING", createdAt: { gte: new Date(Date.now() - 86_400_000) } }, _sum: { amount: true } });
      if ((today._sum.amount ?? 0) < 20) await awardXp(userId, 2, "SPEAKING", "speaking-attempt", attempt.id);
    }
  }
  return serializeAttempt(attempt);
}

export function serializeAttempt(a: SpeakingAttempt) {
  const w = (a.words ?? {}) as { alignment?: Alignment | null; timings?: RecognizedWord[] };
  return {
    id: a.id,
    transcript: a.transcript,
    provider: a.provider,
    providerLabel: PROVIDER_LABEL[a.provider] ?? a.provider,
    assessmentType: a.assessmentType as "PRONUNCIATION_ASSESSMENT" | "TRANSCRIPT_COMPARISON" | "SELF_REVIEW",
    isSimulated: a.isSimulated,
    matchScore: a.matchScore,
    alignment: w.alignment ?? null,
    timings: w.timings ?? [],
    pronunciation: (a.pronunciation as unknown as PronunciationResult | null) ?? null,
    feedback: a.feedback as { summary: string; tips: string[]; caveat: string },
    audioUrl: a.audioKey ? `/api/speech/attempts/${a.id}/audio` : null,
    targetText: a.targetText,
    context: a.context,
    createdAt: a.createdAt,
    audioExpiresAt: a.audioExpiresAt,
  };
}

export async function deleteAttemptAudio(userId: string, attemptId?: string) {
  const attempts = await db.speakingAttempt.findMany({ where: { userId, ...(attemptId ? { id: attemptId } : {}), audioKey: { not: null } }, select: { id: true, audioKey: true } });
  for (const a of attempts) await recordingStore().delete(a.audioKey!);
  await db.speakingAttempt.updateMany({ where: { id: { in: attempts.map((a) => a.id) } }, data: { audioKey: null, audioExpiresAt: null } });
  return attempts.length;
}

