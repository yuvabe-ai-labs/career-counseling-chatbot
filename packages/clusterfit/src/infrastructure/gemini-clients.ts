import { z } from "zod";
import type { ContextExtractor, LiveTokenIssuer } from "../application/ports.js";
import {
  ConversationContextV3Schema,
  loadPrompts,
  pythonJsonDumps,
  type KnownContext,
  type TranscriptTurn,
} from "../situation/conversation-context.js";
import { LIVE_FIELD_MASK, liveConnectSetup } from "../situation/live-config.js";
import { RESPONSE_SCHEMA_V3 } from "../situation/poc-constants.js";

type Fetch = typeof fetch;
const API_BASE = "https://generativelanguage.googleapis.com";

const GeminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(),
      }),
    )
    .optional(),
});

/**
 * The POC's extract_context: a non-Live model turns the transcript into ConversationContext v3
 * with structured output and temperature 0, trying the next model when one is overloaded (5xx) or
 * too slow. All attempts share one budget (default 27 s) inside Lambda's 30 s; every attempt but
 * the last leaves `reserveMs` for the next (plan §16.2 F2). Measured 2026-10-18 on a 26-turn chat:
 * flash-latest 23 s, flash-lite-latest 3.8 s, same fields, hence lite → flash by default.
 */
export class GeminiContextExtractor implements ContextExtractor {
  private readonly fetch: Fetch;

  constructor(
    private readonly options: {
      apiKey: string;
      models: readonly string[];
      budgetMs?: number;
      reserveMs?: number;
      fetch?: Fetch;
    },
  ) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async extract(input: { knownContext: KnownContext; transcript: readonly TranscriptTurn[] }) {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: loadPrompts().extraction }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: pythonJsonDumps({
                known_context: input.knownContext,
                transcript: input.transcript,
              }),
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA_V3,
        temperature: 0,
      },
    });

    const deadline = Date.now() + (this.options.budgetMs ?? 27_000);
    let lastError: unknown = new Error("No extraction model configured");
    for (const [index, model] of this.options.models.entries()) {
      const isLast = index === this.options.models.length - 1;
      const remaining = deadline - Date.now();
      const timeoutMs = isLast ? remaining : remaining - (this.options.reserveMs ?? 6_000);
      if (timeoutMs <= 0) break;
      try {
        const response = await this.fetch(
          `${API_BASE}/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ""))}:generateContent`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": this.options.apiKey },
            body,
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
        if (!response.ok) {
          lastError = new Error(`${model} returned HTTP ${response.status}`);
          if (response.status >= 500 && !isLast) continue;
          throw lastError;
        }
        const payload = GeminiResponseSchema.parse(await response.json());
        const text = (payload.candidates ?? [])
          .flatMap((candidate) => candidate.content?.parts ?? [])
          .map((part) => part.text ?? "")
          .join("")
          .trim();
        return { model, context: ConversationContextV3Schema.parse(JSON.parse(text)) };
      } catch (error) {
        lastError = error;
        const timedOut =
          error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        if (!(timedOut && !isLast)) throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

const TokenResponseSchema = z.object({ name: z.string().startsWith("auth_tokens/") });

/**
 * Mints a single-use Gemini Live ephemeral token with model, prompt, tools and voice locked by
 * LIVE_FIELD_MASK. Verified against gemini-3.8-live (plan §16.4): a client prompt is ignored,
 * tool calls arrive, a second session is refused, and resumption keeps the chat.
 */
export class GeminiLiveTokenIssuer implements LiveTokenIssuer {
  private readonly fetch: Fetch;

  constructor(
    private readonly options: { apiKey: string; model: string; timeoutMs?: number; fetch?: Fetch },
  ) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async issue(input: { systemInstruction: string }) {
    const now = Date.now();
    const expireTime = new Date(now + 30 * 60_000).toISOString();
    const response = await this.fetch(`${API_BASE}/v1alpha/auth_tokens`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.options.apiKey },
      body: JSON.stringify({
        expireTime,
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
        uses: 1,
        bidiGenerateContentSetup: liveConnectSetup(this.options.model, input.systemInstruction),
        fieldMask: LIVE_FIELD_MASK,
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
    });
    if (!response.ok) throw new Error(`Live token request failed: HTTP ${response.status}`);
    const { name } = TokenResponseSchema.parse(await response.json());
    return { token: name, expiresAt: expireTime, model: this.options.model };
  }
}
