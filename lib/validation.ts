/**
 * Upload constraints, shared by the client (for fast feedback) and the API
 * route (as the actual, authoritative check).
 *
 * The client copy is a convenience only — every value here is re-validated
 * server-side in `app/api/convert/route.ts`, because nothing that arrives
 * over the wire can be trusted.
 */

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** Value for an `<input type="file">` accept attribute. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_IMAGE_TYPES, ".jpg"].join(",");

export const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

export const MAX_FILE_LABEL = "8 MB";

export const SUPPORTED_FORMATS_LABEL = "PNG, JPG or WEBP";

/**
 * Magic-number prefixes for the formats we accept. A browser-supplied MIME
 * type is just a string the client chose, so we additionally check that the
 * bytes look like the format they claim to be.
 */
const MAGIC_NUMBERS: Record<AcceptedImageType, (bytes: Uint8Array) => boolean> =
  {
    "image/png": (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    "image/webp": (b) =>
      // "RIFF" .... "WEBP"
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  };

export type ValidationResult =
  { ok: true; type: AcceptedImageType } | { ok: false; error: string };

export function isAcceptedImageType(value: string): value is AcceptedImageType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(value);
}

/**
 * Validates a file's declared type and size. Safe to run in the browser.
 */
export function validateImageMeta(file: {
  type: string;
  size: number;
}): ValidationResult {
  if (!isAcceptedImageType(file.type)) {
    return {
      ok: false,
      error: `Unsupported file type. Please upload a ${SUPPORTED_FORMATS_LABEL} image.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, error: "That file is empty." };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `That image is too large. The maximum size is ${MAX_FILE_LABEL}.`,
    };
  }

  return { ok: true, type: file.type };
}

/**
 * Full server-side validation: declared type, size, and actual file contents.
 */
export function validateImageBytes(
  file: { type: string; size: number },
  bytes: Uint8Array,
): ValidationResult {
  const meta = validateImageMeta(file);
  if (!meta.ok) return meta;

  if (bytes.byteLength > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `That image is too large. The maximum size is ${MAX_FILE_LABEL}.`,
    };
  }

  if (bytes.byteLength < 12 || !MAGIC_NUMBERS[meta.type](bytes)) {
    return {
      ok: false,
      error: `That file doesn't look like a valid ${SUPPORTED_FORMATS_LABEL} image.`,
    };
  }

  return meta;
}
