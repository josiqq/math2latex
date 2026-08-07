/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * This is deliberately simple and process-local: it protects a single instance
 * from obvious abuse without adding infrastructure. On a serverless platform
 * each instance keeps its own counters, so treat it as a speed bump rather
 * than a guarantee.
 *
 * To move to a shared store (Redis, Upstash, Vercel KV), swap the body of
 * `checkRateLimit` — the call site in the route handler stays the same.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Drop expired windows so the map can't grow without bound. */
function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the caller may retry. Only meaningful when blocked. */
  retryAfter: number;
};

export function checkRateLimit(identifier: string): RateLimitResult {
  const now = Date.now();

  // Cheap amortised cleanup — 1-in-50 requests pays for it.
  if (Math.random() < 0.02) sweep(now);

  const existing = windows.get(identifier);

  if (!existing || existing.resetAt <= now) {
    windows.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;

  if (existing.count > MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  return { allowed: true, retryAfter: 0 };
}

/**
 * Best-effort client identifier. Proxy headers are spoofable, so this is only
 * ever used for rate limiting — never for authorization.
 */
export function getClientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
