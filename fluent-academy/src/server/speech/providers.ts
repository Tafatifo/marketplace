import "server-only";
import { env } from "../env";
import { logger } from "../logger";
import { toWav16k } from "./audio";
import type { RecognizerName } from "./config";

const log = logger("speech");

export interface RecognizedWord {
  word: string;
  start: number; // seconds
  end: number;
  confidence?: number; // recogniser confidence, not a pronunciation score
}

export interface Transcription {
  text: string;
  words: RecognizedWord[];
  durationMs?: number;
}

export interface PronunciationResult {
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody?: number;
  overall: number;
  recognizedText: string;
  words: { word: string; accuracy: number; errorType: string; start?: number; end?: number; phonemes?: { phoneme: string; accuracy: number }[] }[];
}

/** Replaceable speech-recognition interface. */
export interface SpeechRecognizer {
  name: RecognizerName;
  transcribe(audio: Buffer, mime: string, language: string, opts?: { mockTranscript?: string }): Promise<Transcription>;
}

export interface PronunciationAssessor {
  name: string;
  assess(audio: Buffer, language: string, referenceText: string): Promise<PronunciationResult>;
}

const LOCALES: Record<string, string> = { en: "en-US", fr: "fr-FR", es: "es-ES", de: "de-DE" };

class LocalWhisperRecognizer implements SpeechRecognizer {
  name = "local" as const;
  async transcribe(audio: Buffer, mime: string, language: string): Promise<Transcription> {
    const e = env();
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(audio)], { type: mime }), "audio");
    form.append("language", language);
    const res = await fetch(`${e.SPEECH_SERVICE_URL}/transcribe`, {
      method: "POST",
      body: form,
      headers: e.SPEECH_SERVICE_TOKEN ? { authorization: `Bearer ${e.SPEECH_SERVICE_TOKEN}` } : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Speech service returned ${res.status}`);
    const data = (await res.json()) as { text: string; words: RecognizedWord[]; duration: number };
    return { text: data.text, words: data.words, durationMs: Math.round(data.duration * 1000) };
  }
}

class OpenAIRecognizer implements SpeechRecognizer {
  name = "openai" as const;
  async transcribe(audio: Buffer, mime: string, language: string): Promise<Transcription> {
    const e = env();
    const form = new FormData();
    const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : mime.includes("wav") ? "wav" : "mp3";
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `audio.${ext}`);
    form.append("model", e.OPENAI_TRANSCRIBE_MODEL);
    form.append("language", language);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    const res = await fetch(`${e.OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      body: form,
      headers: { authorization: `Bearer ${e.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`OpenAI transcription returned ${res.status}`);
    const data = (await res.json()) as { text: string; words?: { word: string; start: number; end: number }[]; duration?: number };
    return { text: data.text ?? "", words: (data.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end })), durationMs: data.duration ? Math.round(data.duration * 1000) : undefined };
  }
}

interface AzureWord {
  Word: string;
  Offset?: number;
  Duration?: number;
  AccuracyScore?: number;
  ErrorType?: string;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
  Phonemes?: { Phoneme: string; AccuracyScore?: number; PronunciationAssessment?: { AccuracyScore?: number } }[];
}
interface AzureNBest {
  Display?: string;
  Lexical?: string;
  Confidence?: number;
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  ProsodyScore?: number;
  PronScore?: number;
  PronunciationAssessment?: { AccuracyScore?: number; FluencyScore?: number; CompletenessScore?: number; ProsodyScore?: number; PronScore?: number };
  Words?: AzureWord[];
}

async function azureRequest(wav: Buffer, language: string, referenceText?: string) {
  const e = env();
  const locale = LOCALES[language] ?? "en-US";
  const headers: Record<string, string> = {
    "Ocp-Apim-Subscription-Key": e.AZURE_SPEECH_KEY!,
    "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
    Accept: "application/json",
  };
  if (referenceText) {
    const cfg = {
      ReferenceText: referenceText,
      GradingSystem: "HundredMark",
      Granularity: "Phoneme",
      Dimension: "Comprehensive",
      EnableMiscue: true,
      // Prosody assessment is only supported for en-US.
      EnableProsodyAssessment: locale === "en-US",
    };
    headers["Pronunciation-Assessment"] = Buffer.from(JSON.stringify(cfg)).toString("base64");
  }
  const url = `https://${e.AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${locale}&format=detailed`;
  const res = await fetch(url, { method: "POST", headers, body: new Uint8Array(wav), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Azure Speech returned ${res.status}`);
  return (await res.json()) as { RecognitionStatus: string; DisplayText?: string; NBest?: AzureNBest[] };
}

class AzureRecognizer implements SpeechRecognizer, PronunciationAssessor {
  name = "azure" as const;
  async transcribe(audio: Buffer, _mime: string, language: string): Promise<Transcription> {
    const wav = await toWav16k(audio);
    const data = await azureRequest(wav, language);
    const best = data.NBest?.[0];
    return {
      text: data.DisplayText ?? best?.Display ?? "",
      words: (best?.Words ?? []).map((w) => ({ word: w.Word, start: (w.Offset ?? 0) / 1e7, end: ((w.Offset ?? 0) + (w.Duration ?? 0)) / 1e7 })),
    };
  }
  async assess(audio: Buffer, language: string, referenceText: string): Promise<PronunciationResult> {
    const wav = await toWav16k(audio);
    const data = await azureRequest(wav, language, referenceText);
    const best = data.NBest?.[0];
    if (!best) throw new Error(`Azure returned no result (${data.RecognitionStatus})`);
    const pa = best.PronunciationAssessment ?? best;
    return {
      accuracy: pa.AccuracyScore ?? 0,
      fluency: pa.FluencyScore ?? 0,
      completeness: pa.CompletenessScore ?? 0,
      prosody: pa.ProsodyScore,
      overall: pa.PronScore ?? 0,
      recognizedText: data.DisplayText ?? best.Display ?? "",
      words: (best.Words ?? []).map((w) => ({
        word: w.Word,
        accuracy: w.PronunciationAssessment?.AccuracyScore ?? w.AccuracyScore ?? 0,
        errorType: w.PronunciationAssessment?.ErrorType ?? w.ErrorType ?? "None",
        start: w.Offset !== undefined ? w.Offset / 1e7 : undefined,
        end: w.Offset !== undefined ? (w.Offset + (w.Duration ?? 0)) / 1e7 : undefined,
        phonemes: w.Phonemes?.map((p) => ({ phoneme: p.Phoneme, accuracy: p.PronunciationAssessment?.AccuracyScore ?? p.AccuracyScore ?? 0 })),
      })),
    };
  }
}

/**
 * Test-only recogniser (STT_PROVIDER=mock, never in production). It returns the
 * transcript the test supplies, so automated tests can exercise the full flow.
 * Results are stored with isSimulated=true and labelled as simulated in the UI.
 */
class MockRecognizer implements SpeechRecognizer {
  name = "mock" as const;
  async transcribe(_audio: Buffer, _mime: string, _language: string, opts?: { mockTranscript?: string }): Promise<Transcription> {
    const text = opts?.mockTranscript ?? "";
    let t = 0;
    return {
      text,
      words: text.split(/\s+/).filter(Boolean).map((w) => {
        const start = t;
        t += 0.4;
        return { word: w, start, end: t, confidence: 0.9 };
      }),
    };
  }
}

export function getRecognizer(name: RecognizerName): SpeechRecognizer {
  switch (name) {
    case "local":
      return new LocalWhisperRecognizer();
    case "openai":
      return new OpenAIRecognizer();
    case "azure":
      return new AzureRecognizer();
    case "mock":
      return new MockRecognizer();
  }
}

export function getPronunciationAssessor(): PronunciationAssessor | null {
  const e = env();
  if (e.PRONUNCIATION_PROVIDER === "none") return null;
  if (e.AZURE_SPEECH_KEY && e.AZURE_SPEECH_REGION) return new AzureRecognizer();
  return null;
}

export async function speechServiceHealth() {
  const e = env();
  if (!e.SPEECH_SERVICE_URL) return { configured: false as const };
  try {
    const res = await fetch(`${e.SPEECH_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return { configured: true as const, ok: res.ok, detail: res.ok ? await res.json() : null };
  } catch (err) {
    log.warn("Speech service health check failed", { error: (err as Error).message });
    return { configured: true as const, ok: false, detail: null };
  }
}
