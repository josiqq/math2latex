import Anthropic from "@anthropic-ai/sdk";

import {
  VisionProviderError,
  type VisionProvider,
  type VisionRequest,
} from "./provider";

/**
 * Anthropic implementation of `VisionProvider`.
 *
 * This is the only file in the project that imports the Anthropic SDK. The
 * API key is read from the server-only `AI_API_KEY` environment variable and
 * never leaves this process.
 */

const DEFAULT_MODEL = "claude-opus-5";

/**
 * Math OCR is a scoped, well-specified task. `medium` effort keeps latency
 * low while leaving the model enough room to reason about dense or
 * handwritten notation. Raise to `high` via `AI_EFFORT` for tricky inputs.
 */
const DEFAULT_EFFORT = "medium";

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORT_LEVELS)[number];

function resolveEffort(): Effort {
  const configured = process.env.AI_EFFORT?.trim();
  return (EFFORT_LEVELS as readonly string[]).includes(configured ?? "")
    ? (configured as Effort)
    : DEFAULT_EFFORT;
}

export function createAnthropicVisionProvider(): VisionProvider {
  return {
    id: "anthropic",

    async analyzeImage(request: VisionRequest): Promise<string> {
      const apiKey = process.env.AI_API_KEY?.trim();

      if (!apiKey) {
        throw new VisionProviderError(
          "not_configured",
          "The conversion service is not configured.",
          503,
        );
      }

      // Retries are handled here rather than by the caller so a transient
      // blip doesn't surface as a user-visible failure.
      const client = new Anthropic({ apiKey, maxRetries: 2 });

      let message;
      try {
        message = await client.beta.messages.create(
          {
            model: process.env.AI_MODEL?.trim() || DEFAULT_MODEL,
            max_tokens: request.maxTokens,
            // Thinking is on by default on this model family and materially
            // improves accuracy on dense notation. `max_tokens` covers
            // thinking plus the answer, so keep it generous.
            thinking: { type: "adaptive" },
            output_config: { effort: resolveEffort() },
            // If a safety classifier declines the request, retry it
            // server-side on Anthropic's recommended fallback model instead
            // of failing the user's conversion.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: request.system,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: request.image.mediaType as
                        "image/png" | "image/jpeg" | "image/webp",
                      data: request.image.base64,
                    },
                  },
                  { type: "text", text: request.instruction },
                ],
              },
            ],
          },
          { signal: request.signal },
        );
      } catch (error) {
        throw toVisionProviderError(error);
      }

      // A refusal comes back as a successful response with empty or partial
      // content, so this has to be checked before reading `content`.
      if (message.stop_reason === "refusal") {
        throw new VisionProviderError(
          "refused",
          "The model declined to process this image. Please try a different one.",
          422,
        );
      }

      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      if (!text) {
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

  if (error instanceof Anthropic.APIUserAbortError) {
    return new VisionProviderError(
      "timeout",
      "The conversion took too long. Please try again.",
      504,
    );
  }

  if (error instanceof Anthropic.RateLimitError) {
    return new VisionProviderError(
      "rate_limited",
      "The service is busy right now. Please try again in a moment.",
      429,
    );
  }

  if (error instanceof Anthropic.AuthenticationError) {
    return new VisionProviderError(
      "not_configured",
      "The conversion service is not configured correctly.",
      503,
    );
  }

  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new VisionProviderError(
      "timeout",
      "The conversion took too long. Please try again.",
      504,
    );
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return new VisionProviderError(
      "upstream",
      "Could not reach the conversion service. Please try again.",
      502,
    );
  }

  return new VisionProviderError(
    "upstream",
    "The conversion service failed to process this image.",
    502,
  );
}
