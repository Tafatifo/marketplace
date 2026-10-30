import "server-only";
import { db } from "../db";
import {
  emailDeliveryMode,
  env,
  pronunciationAssessmentAvailable,
  resolvedAiProvider,
  resolvedBillingMode,
  resolvedTtsProvider,
} from "../env";
import { PROVIDER_LABEL, serverRecognizer } from "../speech/config";
import { speechServiceHealth } from "../speech/providers";

export type CheckState = "ok" | "fallback" | "down" | "off";

export interface ServiceCheck {
  name: string;
  state: CheckState;
  detail: string;
}

/**
 * What is actually configured and reachable. Used by /api/health and the admin
 * overview; reports fallbacks plainly instead of pretending an integration is live.
 */
export async function systemStatus(): Promise<{ ok: boolean; checks: ServiceCheck[] }> {
  const e = env();
  const checks: ServiceCheck[] = [];

  try {
    await db.$queryRaw`SELECT 1`;
    checks.push({ name: "Database", state: "ok", detail: "PostgreSQL reachable" });
  } catch {
    checks.push({ name: "Database", state: "down", detail: "PostgreSQL is not reachable" });
  }

  const ai = resolvedAiProvider();
  checks.push(
    ai === "practice"
      ? { name: "AI coach", state: "fallback", detail: "Practice mode (scripted partner, rule-based corrections). Set ANTHROPIC_API_KEY or OPENAI_API_KEY for live coaching." }
      : { name: "AI coach", state: "ok", detail: ai === "anthropic" ? `Anthropic · ${e.ANTHROPIC_MODEL}` : `OpenAI-compatible · ${e.OPENAI_MODEL}` },
  );

  const speech = await speechServiceHealth();
  const recognizer = serverRecognizer();
  if (recognizer === "local") {
    checks.push(
      speech.configured && speech.ok
        ? { name: "Speech recognition", state: "ok", detail: "Self-hosted Whisper service" }
        : { name: "Speech recognition", state: "down", detail: "SPEECH_SERVICE_URL is set but the service is not responding." },
    );
  } else if (recognizer === "mock") {
    checks.push({ name: "Speech recognition", state: "fallback", detail: "Simulated recogniser (tests only) — not real recognition" });
  } else if (recognizer) {
    checks.push({ name: "Speech recognition", state: "ok", detail: PROVIDER_LABEL[recognizer]! });
  } else {
    checks.push({ name: "Speech recognition", state: "fallback", detail: "No server recogniser configured; learners use the browser's built-in recognition where available." });
  }

  checks.push(
    pronunciationAssessmentAvailable()
      ? { name: "Pronunciation assessment", state: "ok", detail: "Azure pronunciation assessment (per-word accuracy scores)" }
      : { name: "Pronunciation assessment", state: "off", detail: "Not configured. Feedback compares recognised words with the target; it does not score pronunciation." },
  );

  const tts = resolvedTtsProvider();
  checks.push(
    tts === "none"
      ? { name: "Speech synthesis (on demand)", state: "fallback", detail: "Pre-generated curriculum audio only; other text uses the browser voice." }
      : { name: "Speech synthesis (on demand)", state: "ok", detail: tts === "local" ? "Self-hosted Piper" : "OpenAI TTS" },
  );

  const billing = resolvedBillingMode();
  checks.push(
    billing === "stripe"
      ? { name: "Billing", state: e.STRIPE_WEBHOOK_SECRET ? "ok" : "down", detail: e.STRIPE_WEBHOOK_SECRET ? "Stripe" : "Stripe key set but STRIPE_WEBHOOK_SECRET is missing — subscriptions will not activate." }
      : billing === "simulation"
        ? { name: "Billing", state: "fallback", detail: "Simulation mode (development only — no real payments)" }
        : { name: "Billing", state: "off", detail: "Disabled. Set Stripe keys to sell Premium." },
  );

  const mail = emailDeliveryMode();
  checks.push(
    mail === "smtp"
      ? { name: "Email", state: "ok", detail: "SMTP" }
      : mail === "dev-log"
        ? { name: "Email", state: "fallback", detail: "Development mailbox (storage/dev-mailbox)" }
        : { name: "Email", state: "down", detail: "SMTP_URL not set — password reset emails cannot be delivered." },
  );

  const ok = checks.every((c) => c.state !== "down");
  return { ok, checks };
}
