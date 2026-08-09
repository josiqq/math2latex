import { ApiError, GoogleGenAI, type FinishReason } from "@google/genai";

import {
  VisionProviderError,
  type VisionProvider,
  type VisionRequest,
} from "./provider";

/**
 * Google Gemini implementation of `VisionProvider`.
 *
 * This is the only file in the project that imports the Google GenAI SDK. The
 * API key is read from the server-only `AI_API_KEY` environment variable and
 * never leaves this process.
 *
 * Gemini's free tier is what makes this provider worth having, but note that
 * Google may use free-tier requests to improve its models. Paid keys are
 * excluded from that. Choose accordingly for the images your users upload.
 */

/**
 * Free-tier eligible and the strongest of the cheap models at dense notation.
 *
 * Keep this current: Google retires older models for *new* API keys while they
 * still appear in `models.list`, so a stale default fails only for people who
 * just signed up — `gemini-2.5-flash` reached that state.
 */
const DEFAULT_MODEL = "gemini-3.6-flash";

/**
 * Gemini counts thinking tokens against `maxOutputTokens`, so a budget too
 * close to the ceiling starves the answer. These stay well under it, and
 * `resolveThinkingBudget` clamps them against the caller's actual limit.
 */
const EFFORT_BUDGETS = {
  low: 0,
  medium: 1024,
  high: 3072,
  xhigh: 6144,
  max: 12288,
} as const;

type Effort = keyof typeof EFFORT_BUDGETS;

const DEFAULT_EFFORT: Effort = "medium";

/** Room the answer always keeps for itself, whatever the effort setting. */
const ANSWER_HEADROOM_TOKENS = 2000;

function resolveThinkingBudget(maxTokens: number): number {
  const configured = process.env.AI_EFFORT?.trim();
  const effort: Effort =
    configured && configured in EFFORT_BUDGETS
      ? (configured as Effort)
      : DEFAULT_EFFORT;

  return Math.max(
    0,
    Math.min(EFFORT_BUDGETS[effort], maxTokens - ANSWER_HEADROOM_TOKENS),
  );
}

/** Finish reasons that mean the model declined rather than failed. */
const REFUSAL_REASONS: ReadonlySet<string> = new Set<FinishReason>([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
] as FinishReason[]);

export function createGeminiVisionProvider(): VisionProvider {
  return {
    id: "gemini",

    async analyzeImage(request: VisionRequest): Promise<string> {
      const apiKey = process.env.AI_API_KEY?.trim();

      if (!apiKey) {
        throw new VisionProviderError(
          "not_configured",
          "The conversion service is not configured.",
          503,
        );
      }

      const client = new GoogleGenAI({ apiKey });

      let response;
      try {
        response = await client.models.generateContent({
          model: process.env.AI_MODEL?.trim() || DEFAULT_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: request.image.mediaType,
                    data: request.image.base64,
                  },
                },
                { text: request.instruction },
              ],
            },
          ],
          config: {
            systemInstruction: request.system,
            maxOutputTokens: request.maxTokens,
            // Thinking materially improves accuracy on dense notation, but it
            // eats the same budget as the answer — see EFFORT_BUDGETS.
            thinkingConfig: {
              thinkingBudget: resolveThinkingBudget(request.maxTokens),
            },
            // Retries are handled here rather than by the caller so a
            // transient blip doesn't surface as a user-visible failure.
            httpOptions: { retryOptions: { attempts: 3 } },
            abortSignal: request.signal,
          },
        });
      } catch (error) {
        throw toVisionProviderError(error);
      }

      // A blocked prompt and a declined answer are reported in two different
      // places, so both have to be checked before reading the text.
      const blockReason = response.promptFeedback?.blockReason;
      const finishReason = response.candidates?.[0]?.finishReason;

      if (blockReason || (finishReason && REFUSAL_REASONS.has(finishReason))) {
        throw new VisionProviderError(
          "refused",
          "The model declined to process this image. Please try a different one.",
          422,
        );
      }

      const text = response.text?.trim();

      if (!text) {
        // Thinking can consume the whole budget and leave nothing behind,
        // which is a configuration problem rather than a blank image.
        if (finishReason === "MAX_TOKENS") {
          throw new VisionProviderError(
            "upstream",
            "The conversion ran out of room. Please try a simpler image.",
            502,
          );
        }

        throw new VisionProviderError(
          "empty_response",
          "No mathematical content was found in that image.",
          422,
        );
      }

      return text;
    },
  };
}

/** Maps SDK errors onto user-safe messages, without leaking provider detail. */
function toVisionProviderError(error: unknown): VisionProviderError {
  if (error instanceof VisionProviderError) return error;

  // `abortSignal` aborts client-side, so the timeout surfaces as a
  // DOMException — named either way depending on how the abort was raised.
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return new VisionProviderError(
      "timeout",
      "The conversion took too long. Please try again.",
      504,
    );
  }

  if (error instanceof ApiError) {
    // The status alone is safe to log and is the only clue that survives the
    // mapping to a user-facing message.
    console.error(`[gemini] api error status: ${error.status}`);

    if (error.status === 429) {
      return new VisionProviderError(
        "rate_limited",
        "The service is busy right now. Please try again in a moment.",
        429,
      );
    }

    // A rejected key and a retired or misspelled model are both deployment
    // problems, and both need the operator — not the user — to act.
    if (error.status === 401 || error.status === 403 || error.status === 404) {
      return new VisionProviderError(
        "not_configured",
        "The conversion service is not configured correctly.",
        503,
      );
    }
  }

  return new VisionProviderError(
    "upstream",
    "The conversion service failed to process this image.",
    502,
  );
}
