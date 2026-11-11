/** In-memory coordinator used by the Durable Object and by Node tests. Not a network adapter. */

export type KvPutOpts = { expirationTtl?: number };

type Entry = { value: string; exp?: number };

function ttlExp(opts: KvPutOpts | undefined, now: number): number | undefined {
  if (opts?.expirationTtl == null) return undefined;
  return now + Math.max(1, Math.ceil(opts.expirationTtl)) * 1000;
}

export class AmrIdCoordinator {
  private kv = new Map<string, Entry>();

  get(key: string, now = Date.now()): string | null {
    const entry = this.kv.get(key);
    if (!entry) return null;
    if (entry.exp != null && entry.exp <= now) {
      this.kv.delete(key);
      return null;
    }
    return entry.value;
  }

  put(key: string, value: string, opts?: KvPutOpts, now = Date.now()): void {
    const exp = ttlExp(opts, now);
    this.kv.set(key, exp != null ? { value, exp } : { value });
  }

  delete(key: string): void {
    this.kv.delete(key);
  }

  list(prefix: string, now = Date.now()): string[] {
    const names: string[] = [];
    for (const [k, entry] of this.kv) {
      if (entry.exp != null && entry.exp <= now) {
        this.kv.delete(k);
        continue;
      }
      if (k.startsWith(prefix)) names.push(k);
    }
    return names.sort();
  }

  compareAndSet(key: string, expected: string | null, next: string, opts?: KvPutOpts, now = Date.now()): boolean {
    const cur = this.get(key, now);
    if (cur !== expected) return false;
    this.put(key, next, opts, now);
    return true;
  }

  takeRateLimit(key: string, windowMs: number, max: number, now = Date.now()): { ok: boolean; retryAfterMs: number; remaining: number } {
    const rk = `ratelimit:${key}`;
    const raw = this.get(rk, now);
    const arr = (raw ? (JSON.parse(raw) as number[]) : []).filter((t) => now - t < windowMs);
    const ttl = { expirationTtl: Math.max(60, Math.ceil(windowMs / 1000) + 1) };
    if (arr.length >= max) {
      this.put(rk, JSON.stringify(arr), ttl, now);
      const oldest = arr[0] ?? now;
      return { ok: false, retryAfterMs: Math.max(0, windowMs - (now - oldest)), remaining: 0 };
    }
    const next = [...arr, now];
    this.put(rk, JSON.stringify(next), ttl, now);
    return { ok: true, retryAfterMs: 0, remaining: max - next.length };
  }
}
