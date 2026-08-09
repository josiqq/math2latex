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

/** Free-tier eligible and the strongest of the cheap models at dense notation. */
const DEFAULT_MODEL = "gemini-2.5-flash";

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
        throw await toVisionProviderError(error, client);
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

/**
 * Google reports the machine-readable reason inside a JSON body carried on the
 * error message, so the useful part has to be dug out rather than read off a
 * field. Returns the `status`/`reason` pair, e.g. `INVALID_ARGUMENT`,
 * `API_KEY_INVALID`.
 */
function describeApiError(error: ApiError): string {
  const parts = [String(error.status)];

  try {
    const body = JSON.parse(error.message) as {
      error?: {
        status?: string;
        details?: Array<{ reason?: string }>;
      };
    };

    const status = body.error?.status;
    if (status) parts.push(status);

    const reason = body.error?.details?.find((d) => d.reason)?.reason;
    if (reason) parts.push(reason);
  } catch {
    // Not every failure carries a JSON body; the status alone still helps.
  }

  return parts.join(" ");
}

/** Longest prose excerpt a log line will carry from the provider. */
const MESSAGE_EXCERPT_CHARS = 220;

/**
 * Google's prose explanation, which for a 404 names the model and the API
 * version it was looked up under — the one thing the status codes don't say.
 *
 * Only safe to log for errors raised before the request body is examined;
 * for those, Google echoes the model name and nothing the user uploaded.
 */
function apiErrorMessage(error: ApiError): string {
  try {
    const body = JSON.parse(error.message) as { error?: { message?: string } };
    const message = body.error?.message;

    return message ? message.slice(0, MESSAGE_EXCERPT_CHARS) : "";
  } catch {
    return "";
  }
}

/** True for the several shapes Google uses to say "this key is no good". */
function isCredentialError(error: ApiError, description: string): boolean {
  if (error.status === 401 || error.status === 403) return true;

  // An invalid or wrong-provider key comes back as a plain 400, which is
  // otherwise indistinguishable from a malformed request.
  return (
    error.status === 400 &&
    /API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/.test(description)
  );
}

/** How many model names the 404 log line is allowed to carry. */
const MODEL_HINT_LIMIT = 12;

/**
 * The models this key can actually call, so a 404 says what to put in
 * `AI_MODEL` instead of only what failed. Best effort — a failure here must
 * never replace the error actually being reported.
 */
async function listUsableModels(client: GoogleGenAI): Promise<string> {
  try {
    const names: string[] = [];

    for await (const model of await client.models.list()) {
      if (!model.supportedActions?.includes("generateContent")) continue;

      const name = model.name?.replace(/^models\//, "");
      if (name) names.push(name);
      if (names.length >= MODEL_HINT_LIMIT) break;
    }

    return names.length > 0 ? `try one of: ${names.join(", ")}` : "none listed";
  } catch {
    return "model list unavailable";
  }
}

/** Maps SDK errors onto user-safe messages, without leaking provider detail. */
async function toVisionProviderError(
  error: unknown,
  client: GoogleGenAI,
): Promise<VisionProviderError> {
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
    const detail = describeApiError(error);

    if (error.status === 429) {
      return new VisionProviderError(
        "rate_limited",
        "The service is busy right now. Please try again in a moment.",
        429,
        detail,
      );
    }

    if (isCredentialError(error, detail)) {
      return new VisionProviderError(
        "not_configured",
        "The conversion service is not configured correctly.",
        503,
        `bad AI_API_KEY for provider "gemini" — ${detail}`,
      );
    }

    // A model the key cannot reach — a typo in AI_MODEL, or a model this
    // account has no access to. Also a deployment problem, not a bad image.
    if (error.status === 404) {
      const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL;

      return new VisionProviderError(
        "not_configured",
        "The conversion service is not configured correctly.",
        503,
        `AI_MODEL "${model}" not available — ${detail}: ${apiErrorMessage(error)}; ${await listUsableModels(client)}`,
      );
    }

    return new VisionProviderError(
      "upstream",
      "The conversion service failed to process this image.",
      502,
      detail,
    );
  }

  return new VisionProviderError(
    "upstream",
    "The conversion service failed to process this image.",
    502,
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : "unknown error",
  );
}
