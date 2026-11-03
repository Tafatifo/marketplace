import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z, type ZodType } from "zod";
import { env, resolvedAiProvider } from "../env";
import { HttpError } from "../http";
import { logger } from "../logger";

const log = logger("ai");

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  purpose: string; // for logs
}

/** Replaceable language-model interface. All calls are server-side; keys never reach the browser. */
export interface LanguageModel {
  provider: "anthropic" | "openai";
  model: string;
  generate<S extends ZodType>(system: string, messages: ChatTurn[], schema: S, opts: GenerateOptions): Promise<z.infer<S>>;
}

class AnthropicModel implements LanguageModel {
  provider = "anthropic" as const;
  private client: Anthropic;
  constructor(public model: string) {
    this.client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 });
  }

  async generate<S extends ZodType>(system: string, messages: ChatTurn[], schema: S, opts: GenerateOptions): Promise<z.infer<S>> {
    try {
      const res = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: opts.maxTokens ?? 4000,
        system,
        messages,
        // Re-runs a policy-declined request on Anthropic's recommended fallback model server-side.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: opts.effort ?? env().ANTHROPIC_EFFORT, format: betaZodOutputFormat(schema) },
      });
      if (res.stop_reason === "refusal") throw new HttpError(422, "ai_refused", "The coach couldn't respond to that message. Try rephrasing it.");
      if (res.stop_reason === "max_tokens") throw new Error("Response truncated (max_tokens)");
      if (!res.parsed_output) throw new Error("No structured output returned");
      return res.parsed_output as z.infer<S>;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof Anthropic.RateLimitError) {
        log.warn("Anthropic rate limit", { purpose: opts.purpose });
        throw new HttpError(503, "ai_busy", "The coach is busy right now. Please try again in a moment.");
      }
      if (err instanceof Anthropic.AuthenticationError) {
        log.error("Anthropic authentication failed — check ANTHROPIC_API_KEY", { purpose: opts.purpose });
        throw new HttpError(503, "ai_unavailable", "The AI coach is not available right now.");
      }
      if (err instanceof Anthropic.APIError) {
        log.error("Anthropic API error", { status: err.status, purpose: opts.purpose, message: err.message });
        throw new HttpError(502, "ai_error", "The coach ran into a problem. Please try again.");
      }
      log.error("Anthropic call failed", { purpose: opts.purpose, error: err });
      throw new HttpError(502, "ai_error", "The coach ran into a problem. Please try again.");
    }
  }
}

/** Any OpenAI-compatible Chat Completions endpoint (OpenAI, Azure OpenAI, OpenRouter, Ollama, vLLM…). */
class OpenAICompatibleModel implements LanguageModel {
  provider = "openai" as const;
  constructor(public model: string) {}

  async generate<S extends ZodType>(system: string, messages: ChatTurn[], schema: S, opts: GenerateOptions): Promise<z.infer<S>> {
    const e = env();
    const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
    const res = await fetch(`${e.OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${e.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: this.model,
        max_tokens: opts.maxTokens ?? 3000,
        messages: [{ role: "system", content: system }, ...messages],
        response_format: { type: "json_schema", json_schema: { name: "response", strict: true, schema: jsonSchema } },
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch((err) => {
      log.error("OpenAI-compatible request failed", { purpose: opts.purpose, error: err });
      throw new HttpError(502, "ai_error", "The coach ran into a problem. Please try again.");
    });
    if (res.status === 429) throw new HttpError(503, "ai_busy", "The coach is busy right now. Please try again in a moment.");
    if (!res.ok) {
      log.error("OpenAI-compatible API error", { status: res.status, purpose: opts.purpose });
      throw new HttpError(502, "ai_error", "The coach ran into a problem. Please try again.");
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
    const msg = data.choices?.[0]?.message;
    if (msg?.refusal) throw new HttpError(422, "ai_refused", "The coach couldn't respond to that message. Try rephrasing it.");
    try {
      return schema.parse(JSON.parse(msg?.content ?? "")) as z.infer<S>;
    } catch {
      log.error("Model returned invalid JSON", { purpose: opts.purpose });
      throw new HttpError(502, "ai_error", "The coach returned an unexpected response. Please try again.");
    }
  }
}

/** The configured model, or null when the platform runs in practice (scripted) mode. */
export function getLanguageModel(): LanguageModel | null {
  const p = resolvedAiProvider();
  if (p === "anthropic") return new AnthropicModel(env().ANTHROPIC_MODEL);
  if (p === "openai") return new OpenAICompatibleModel(env().OPENAI_MODEL);
  return null;
}
