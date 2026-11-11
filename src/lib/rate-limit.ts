import type { KvStore } from "./storage/types.ts";

export type RateLimitResult = {
  ok: boolean;
  retryAfterMs: number;
  remaining: number;
};

export type RateLimiter = {
  take(key: string, now?: number): Promise<RateLimitResult> | RateLimitResult;
};

export type AsyncRateLimiter = {
  take(key: string, now?: number): Promise<RateLimitResult>;
};

export type RateLimitOpts = {
  windowMs: number;
  max: number;
};

function ttlSeconds(windowMs: number): number {
  return Math.max(60, Math.ceil(windowMs / 1000) + 1);
}

export function createMemoryRateLimiter(opts: RateLimitOpts): AsyncRateLimiter {
  const hits = new Map<string, number[]>();
  return {
    async take(key, now = Date.now()) {
      if (hits.size > 64) {
        for (const [k, times] of hits) {
          const kept = times.filter((t) => now - t < opts.windowMs);
          if (kept.length === 0) hits.delete(k);
          else hits.set(k, kept);
        }
      }
      const arr = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (arr.length === 0) hits.delete(key);
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

/** Rate-limit counters stored in the app KV (Cloudflare KV when those envs are set). Keys expire with the window. */
export function createKvRateLimiter(kv: KvStore, opts: RateLimitOpts, scope: string): AsyncRateLimiter {
  const ttl = { expirationTtl: ttlSeconds(opts.windowMs) };
  return {
    async take(key, now = Date.now()) {
      const rk = `ratelimit:${scope}:${key}`;
      for (let i = 0; i < 4; i++) {
        const raw = await kv.get(rk);
        const arr = (raw ? (JSON.parse(raw) as number[]) : []).filter((t) => now - t < opts.windowMs);
        if (arr.length === 0 && raw) {
          await kv.delete(rk);
        }
        if (arr.length >= opts.max) {
          if (JSON.stringify(arr) !== raw) await kv.compareAndSet(rk, raw, JSON.stringify(arr), ttl);
          const oldest = arr[0] ?? now;
          return { ok: false, retryAfterMs: Math.max(0, opts.windowMs - (now - oldest)), remaining: 0 };
        }
        const next = [...arr, now];
        if (await kv.compareAndSet(rk, raw, JSON.stringify(next), ttl)) {
          return { ok: true, retryAfterMs: 0, remaining: opts.max - next.length };
        }
      }
      return { ok: false, retryAfterMs: opts.windowMs, remaining: 0 };
    },
  };
}

export const LOGIN_LIMIT: RateLimitOpts = { windowMs: 15 * 60_000, max: 8 };
export const OTP_LIMIT: RateLimitOpts = { windowMs: 15 * 60_000, max: 5 };
export const NICK_LIMIT: RateLimitOpts = { windowMs: 15 * 60_000, max: 30 };
