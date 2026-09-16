/**
 * Fixed-window rate limiter.
 *
 * In-memory, matching the rest of the MVP infrastructure (`lib/store.ts`). That
 * means it is per-process: it resets on cold start and does not coordinate
 * across serverless instances, so treat it as abuse friction rather than a
 * quota. When reports and accounts move to a shared store, move these counters
 * with them — the call sites should not need to change.
 */

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds when the current window expires. */
  resetAt: number;
  retryAfterSec: number;
}

interface Counter {
  count: number;
  resetAt: number;
}

const counters = new Map<string, Counter>();
const MAX_COUNTERS = 10_000;

function sweep(now: number): void {
  for (const [key, counter] of counters) {
    if (counter.resetAt <= now) counters.delete(key);
  }
}

export function rateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const existing = counters.get(key);

  if (!existing || existing.resetAt <= now) {
    // Only pay for a sweep when the table is getting large.
    if (counters.size >= MAX_COUNTERS) {
      sweep(now);
      if (counters.size >= MAX_COUNTERS) counters.clear();
    }
    const resetAt = now + rule.windowMs;
    counters.set(key, { count: 1, resetAt });
    return {
      ok: true,
      limit: rule.limit,
      remaining: rule.limit - 1,
      resetAt,
      retryAfterSec: 0,
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, rule.limit - existing.count);
  const ok = existing.count <= rule.limit;

  return {
    ok,
    limit: rule.limit,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSec: ok ? 0 : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/** Test seam — drops every counter. */
export function resetRateLimits(): void {
  counters.clear();
}

/**
 * Best-effort caller identity. Behind Vercel `x-forwarded-for` is set by the
 * platform; locally it is usually absent and every caller shares one bucket.
 */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  const ip = first || request.headers.get("x-real-ip")?.trim() || "unknown";
  return `${scope}:${ip}`;
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000))),
  };
  if (!result.ok) headers["Retry-After"] = String(result.retryAfterSec);
  return headers;
}

/** 429 response with the standard headers attached. */
export function tooManyRequests(
  result: RateLimitResult,
  message: string,
): Response {
  return Response.json(
    { error: message, code: "rate_limited", retryAfterSec: result.retryAfterSec },
    { status: 429, headers: rateLimitHeaders(result) },
  );
}
