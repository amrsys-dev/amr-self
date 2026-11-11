export type RateLimitResult = {
  ok: boolean;
  retryAfterMs: number;
  remaining: number;
};

export type RateLimiter = {
  take(key: string, now?: number): RateLimitResult;
};

export type RateLimitOpts = {
  windowMs: number;
  max: number;
};

export function createMemoryRateLimiter(opts: RateLimitOpts): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    take(key, now = Date.now()) {
      const arr = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (arr.length >= opts.max) {
        hits.set(key, arr);
        const oldest = arr[0] ?? now;
        return { ok: false, retryAfterMs: Math.max(0, opts.windowMs - (now - oldest)), remaining: 0 };
      }
      arr.push(now);
      hits.set(key, arr);
      return { ok: true, retryAfterMs: 0, remaining: opts.max - arr.length };
    },
  };
}

export const LOGIN_LIMIT: RateLimitOpts = { windowMs: 15 * 60_000, max: 8 };
export const OTP_LIMIT: RateLimitOpts = { windowMs: 15 * 60_000, max: 5 };
