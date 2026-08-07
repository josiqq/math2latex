/**
 * Provider-agnostic contract for the vision model that performs the OCR.
 *
 * Nothing above this file knows which vendor is in use. To swap providers,
 * write a module that exports a `VisionProvider` and register it in
 * `PROVIDERS` below — no route or component code changes.
 */

import { createAnthropicVisionProvider } from "./anthropic";

export type VisionErrorCode =
  /** No API key configured — a deployment problem, not a user problem. */
  | "not_configured"
  /** The provider took too long to answer. */
  | "timeout"
  /** The provider is rate limiting or overloaded. */
  | "rate_limited"
  /** The model answered, but with nothing usable. */
  | "empty_response"
  /** The model declined to answer. */
  | "refused"
  /** Anything else coming back from the provider. */
  | "upstream";

/** Errors that carry a user-safe message and an HTTP status for the route. */
export class VisionProviderError extends Error {
  readonly code: VisionErrorCode;
  readonly status: number;

  constructor(code: VisionErrorCode, message: string, status: number) {
    super(message);
    this.name = "VisionProviderError";
    this.code = code;
    this.status = status;
  }
}

export type VisionImage = {
  /** Raw base64 payload — no `data:` URL prefix. */
  base64: string;
  /** e.g. `image/png`. */
  mediaType: string;
};

export type VisionRequest = {
  /** System-level instruction defining the model's role. */
  system: string;
  /** The per-request instruction accompanying the image. */
  instruction: string;
  image: VisionImage;
  maxTokens: number;
  signal?: AbortSignal;
};

export interface VisionProvider {
  /** Stable identifier, used for logging and the `AI_PROVIDER` env var. */
  readonly id: string;
  /** Returns the model's plain-text answer for the supplied image. */
  analyzeImage(request: VisionRequest): Promise<string>;
}

type ProviderFactory = () => VisionProvider;

/**
 * Registry of available providers. Add new entries here; the key is the value
 * users put in `AI_PROVIDER`.
 *
 * The factories are only invoked for the selected provider, so an unused
 * provider never constructs a client or reads its credentials.
 */
const PROVIDERS: Record<string, ProviderFactory> = {
  anthropic: createAnthropicVisionProvider,
};

export const DEFAULT_PROVIDER_ID = "anthropic";

let cached: VisionProvider | undefined;

export function getVisionProvider(): VisionProvider {
  if (cached) return cached;

  const id = process.env.AI_PROVIDER?.trim() || DEFAULT_PROVIDER_ID;
  const factory = PROVIDERS[id];

  if (!factory) {
    throw new VisionProviderError(
      "not_configured",
      `Unknown AI provider "${id}". Supported: ${Object.keys(PROVIDERS).join(", ")}.`,
      500,
    );
  }

  cached = factory();
  return cached;
}
