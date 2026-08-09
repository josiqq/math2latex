import { imageToLatex } from "@/lib/ai/vision";
import { VisionProviderError } from "@/lib/ai/provider";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { MAX_FILE_BYTES, validateImageBytes } from "@/lib/validation";

/**
 * POST /api/convert
 *
 * Accepts `multipart/form-data` with a single `image` field and returns the
 * LaTeX transcription of the mathematics it contains.
 *
 * Success: 200 `{ "latex": "..." }`
 * Failure: 4xx/5xx `{ "error": "..." }`
 *
 * The image is held in memory for the duration of the request only — nothing
 * is written to disk, and image bytes are never logged.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SuccessBody = { latex: string };
type ErrorBody = { error: string };

function fail(message: string, status: number): Response {
  return Response.json({ error: message } satisfies ErrorBody, { status });
}

export async function POST(request: Request): Promise<Response> {
  const rateLimit = checkRateLimit(getClientIdentifier(request));
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: "Too many conversions. Please wait a moment and try again.",
      } satisfies ErrorBody,
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return fail("Expected a multipart/form-data upload.", 415);
  }

  // Reject oversized bodies before buffering them, when the client tells us.
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_FILE_BYTES * 1.1
  ) {
    return fail("That image is too large.", 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("The upload could not be read. Please try again.", 400);
  }

  const image = formData.get("image");

  if (!image || typeof image === "string") {
    return fail("No image was uploaded.", 400);
  }

  const file = image as File;

  // The filename is never trusted or used — the bytes decide the format.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateImageBytes(
    { type: file.type, size: bytes.byteLength },
    bytes,
  );

  if (!validation.ok) {
    return fail(validation.error, 400);
  }

  try {
    const latex = await imageToLatex({
      base64: Buffer.from(bytes).toString("base64"),
      mediaType: validation.type,
    });

    return Response.json({ latex } satisfies SuccessBody, { status: 200 });
  } catch (error) {
    if (error instanceof VisionProviderError) {
      // Log the classification and the provider's own status/reason — never
      // the prompt or the image. Without the detail a misconfigured key is
      // indistinguishable from a provider outage.
      console.error(
        `[convert] provider error: ${error.code}` +
          (error.detail ? ` (${error.detail})` : ""),
      );
      return fail(error.message, error.status);
    }

    console.error("[convert] unexpected error", error);
    return fail("Unable to process the image.", 500);
  }
}

/** Anything other than POST on this route is a client mistake. */
export async function GET(): Promise<Response> {
  return fail("Method not allowed. Use POST.", 405);
}
