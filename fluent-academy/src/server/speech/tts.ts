import "server-only";
import { createHash } from "node:crypto";
import { env, resolvedTtsProvider } from "../env";
import { ttsStore } from "../storage";

/**
 * Text-to-speech for dynamic text (AI coach replies). Curriculum audio is
 * pre-generated; this path synthesises on demand and caches by content hash.
 */
export async function synthesize(text: string, language: string, gender: "f" | "m" = "f"): Promise<{ hash: string } | null> {
  const provider = resolvedTtsProvider();
  if (provider === "none") return null;
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 1200);
  const hash = createHash("sha1").update(`${provider}|${language}|${gender}|${clean}`).digest("hex").slice(0, 24);
  const key = `${hash}.mp3`;
  if (await ttsStore().exists(key)) return { hash };
  const e = env();
  let audio: Buffer;
  if (provider === "local") {
    const res = await fetch(`${e.SPEECH_SERVICE_URL}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(e.SPEECH_SERVICE_TOKEN ? { authorization: `Bearer ${e.SPEECH_SERVICE_TOKEN}` } : {}) },
      body: JSON.stringify({ text: clean, language, gender }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`TTS service returned ${res.status}`);
    audio = Buffer.from(await res.arrayBuffer());
  } else {
    const res = await fetch(`${e.OPENAI_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${e.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: e.OPENAI_TTS_MODEL, voice: gender === "m" ? "onyx" : "nova", input: clean, response_format: "mp3" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`OpenAI TTS returned ${res.status}`);
    audio = Buffer.from(await res.arrayBuffer());
  }
  await ttsStore().put(key, audio);
  return { hash };
}
