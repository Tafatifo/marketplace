import "server-only";
import { z } from "zod";

/**
 * Centralised, validated server configuration.
 *
 * Every integration (AI, speech, payments, email, storage) is optional: when its
 * credentials are absent the platform falls back to a clearly labelled local or
 * practice implementation instead of pretending the integration is live.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(16).optional(),
  ADMIN_EMAILS: z.string().default(""),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Email (password recovery)
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("Fluent Academy <no-reply@fluent-academy.local>"),

  // Language model
  AI_PROVIDER: z.enum(["auto", "anthropic", "openai", "practice"]).default("auto"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high"]).default("low"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),

  // Speech
  STT_PROVIDER: z.enum(["auto", "local", "openai", "azure", "mock"]).default("auto"),
  PRONUNCIATION_PROVIDER: z.enum(["auto", "azure", "none"]).default("auto"),
  TTS_PROVIDER: z.enum(["auto", "local", "openai", "none"]).default("auto"),
  SPEECH_SERVICE_URL: z.string().url().optional(),
  SPEECH_SERVICE_TOKEN: z.string().optional(),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("whisper-1"),
  OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
  AZURE_SPEECH_KEY: z.string().optional(),
  AZURE_SPEECH_REGION: z.string().optional(),
  FFMPEG_PATH: z.string().default("ffmpeg"),

  // Storage
  RECORDINGS_DIR: z.string().default("./storage/recordings"),
  TTS_CACHE_DIR: z.string().default("./storage/tts"),
  AUDIO_BASE_URL: z.string().optional(),
  RECORDING_RETENTION_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  MAX_UPLOAD_BYTES: z.coerce.number().int().default(5 * 1024 * 1024),

  // Billing
  BILLING_MODE: z.enum(["auto", "stripe", "simulation", "disabled"]).default("auto"),
  ALLOW_SIMULATED_BILLING: z.enum(["true", "false"]).default("false"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PREMIUM_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PREMIUM_YEARLY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached configuration so process.env changes apply. */
export function resetEnvCache() {
  cached = null;
}

export const isProduction = () => env().NODE_ENV === "production";

export type AiProviderName = "anthropic" | "openai" | "practice";

export function resolvedAiProvider(): AiProviderName {
  const e = env();
  if (e.AI_PROVIDER === "anthropic") return e.ANTHROPIC_API_KEY ? "anthropic" : "practice";
  if (e.AI_PROVIDER === "openai") return e.OPENAI_API_KEY ? "openai" : "practice";
  if (e.AI_PROVIDER === "practice") return "practice";
  if (e.ANTHROPIC_API_KEY) return "anthropic";
  if (e.OPENAI_API_KEY) return "openai";
  return "practice";
}

export type SttProviderName = "local" | "openai" | "azure" | "mock";

export function resolvedSttProvider(): SttProviderName {
  const e = env();
  if (e.STT_PROVIDER !== "auto") return e.STT_PROVIDER;
  if (e.AZURE_SPEECH_KEY && e.AZURE_SPEECH_REGION) return "azure";
  if (e.SPEECH_SERVICE_URL) return "local";
  if (e.OPENAI_API_KEY) return "openai";
  return "mock";
}

export function pronunciationAssessmentAvailable(): boolean {
  const e = env();
  if (e.PRONUNCIATION_PROVIDER === "none") return false;
  return Boolean(e.AZURE_SPEECH_KEY && e.AZURE_SPEECH_REGION);
}

export type TtsProviderName = "local" | "openai" | "none";

export function resolvedTtsProvider(): TtsProviderName {
  const e = env();
  if (e.TTS_PROVIDER !== "auto") return e.TTS_PROVIDER;
  if (e.SPEECH_SERVICE_URL) return "local";
  if (e.OPENAI_API_KEY) return "openai";
  return "none";
}

export type BillingMode = "stripe" | "simulation" | "disabled";

export function resolvedBillingMode(): BillingMode {
  const e = env();
  const simulationAllowed = e.NODE_ENV !== "production" || e.ALLOW_SIMULATED_BILLING === "true";
  if (e.BILLING_MODE === "stripe") return e.STRIPE_SECRET_KEY ? "stripe" : "disabled";
  if (e.BILLING_MODE === "simulation") return simulationAllowed ? "simulation" : "disabled";
  if (e.BILLING_MODE === "disabled") return "disabled";
  if (e.STRIPE_SECRET_KEY) return "stripe";
  return simulationAllowed ? "simulation" : "disabled";
}

export function emailDeliveryMode(): "smtp" | "dev-log" | "disabled" {
  const e = env();
  if (e.SMTP_URL) return "smtp";
  return e.NODE_ENV === "production" ? "disabled" : "dev-log";
}
