import "server-only";
import { env, pronunciationAssessmentAvailable } from "../env";

export type RecognizerName = "azure" | "local" | "openai" | "mock";

/** The server-side recogniser in use, or null when only the browser can recognise speech. */
export function serverRecognizer(): RecognizerName | null {
  const e = env();
  if (e.STT_PROVIDER === "mock") return e.NODE_ENV === "production" ? null : "mock";
  if (e.STT_PROVIDER === "azure" || (e.STT_PROVIDER === "auto" && e.AZURE_SPEECH_KEY && e.AZURE_SPEECH_REGION)) {
    return e.AZURE_SPEECH_KEY && e.AZURE_SPEECH_REGION ? "azure" : null;
  }
  if (e.STT_PROVIDER === "local" || (e.STT_PROVIDER === "auto" && e.SPEECH_SERVICE_URL)) return e.SPEECH_SERVICE_URL ? "local" : null;
  if (e.STT_PROVIDER === "openai" || (e.STT_PROVIDER === "auto" && e.OPENAI_API_KEY)) return e.OPENAI_API_KEY ? "openai" : null;
  return null;
}

export const PROVIDER_LABEL: Record<string, string> = {
  azure: "Azure AI Speech (pronunciation assessment)",
  local: "Self-hosted Whisper speech recognition",
  openai: "OpenAI speech recognition",
  browser: "Your browser's speech recognition",
  mock: "Simulated recognition (test mode)",
  none: "No speech recognition — self-review only",
};

export function speechClientConfig() {
  const server = serverRecognizer();
  return {
    mode: (server ? "server" : "browser") as "server" | "browser" | "none",
    provider: server ?? "browser",
    pronunciation: pronunciationAssessmentAvailable(),
    simulated: server === "mock",
  };
}
