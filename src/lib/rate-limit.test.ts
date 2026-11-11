import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKvRateLimiter, createMemoryRateLimiter } from "./rate-limit.ts";
import { createMemoryStores } from "./storage/memory.ts";
import type { KvPutOpts, KvStore } from "./storage/types.ts";

describe("rate limit", () => {
  it("allows up to max hits in the window, then blocks", async () => {
    const lim = createMemoryRateLimiter({ windowMs: 1000, max: 3 });
    const t0 = 1_000_000;
    assert.equal((await lim.take("a", t0)).ok, true);
    assert.equal((await lim.take("a", t0 + 10)).ok, true);
    const third = await lim.take("a", t0 + 20);
    assert.equal(third.ok, true);
    assert.equal(third.remaining, 0);
    const blocked = await lim.take("a", t0 + 30);
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterMs > 900);
    assert.equal((await lim.take("b", t0 + 30)).ok, true);
    assert.equal((await lim.take("a", t0 + 1001)).ok, true);
  });

  it("persists counters in the KV adapter", async () => {
    const { kv } = createMemoryStores();
    const lim = createKvRateLimiter(kv, { windowMs: 1000, max: 2 }, "test");
    const t0 = 2_000_000;
    assert.equal((await lim.take("x", t0)).ok, true);
    assert.equal((await lim.take("x", t0 + 5)).ok, true);
    assert.equal((await lim.take("x", t0 + 10)).ok, false);
    const stored = await kv.get("ratelimit:test:x");
    assert.ok(stored);
    assert.equal(JSON.parse(stored!).length, 2);
  });

  it("writes KV rate-limit keys with a TTL and drops expired memory keys", async () => {
    const ttls: number[] = [];
    const inner = createMemoryStores().kv;
    const kv: KvStore = {
      get: (k) => inner.get(k),
      delete: (k) => inner.delete(k),
      list: (p) => inner.list(p),
      put: async (k, v, opts?: KvPutOpts) => {
        if (opts?.expirationTtl != null) ttls.push(opts.expirationTtl);
        await inner.put(k, v, opts);
      },
      compareAndSet: async (k, e, n, opts?: KvPutOpts) => {
        if (opts?.expirationTtl != null) ttls.push(opts.expirationTtl);
        return inner.compareAndSet(k, e, n, opts);
      },
    };
    const lim = createKvRateLimiter(kv, { windowMs: 1000, max: 2 }, "ttl");
    assert.equal((await lim.take("z", 3_000_000)).ok, true);
    assert.ok(ttls.length >= 1);
    assert.ok(ttls.every((n) => n >= 2));
    const mem = createMemoryStores().kv;
    await mem.put("ratelimit:tmp", "[1]", { expirationTtl: 1 });
    assert.ok(await mem.get("ratelimit:tmp"));
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(await mem.get("ratelimit:tmp"), null);
  });
});
