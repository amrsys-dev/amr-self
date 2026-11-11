import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryRateLimiter } from "./rate-limit.ts";

describe("rate limit", () => {
  it("allows up to max hits in the window, then blocks", () => {
    const lim = createMemoryRateLimiter({ windowMs: 1000, max: 3 });
    const t0 = 1_000_000;
    assert.equal(lim.take("a", t0).ok, true);
    assert.equal(lim.take("a", t0 + 10).ok, true);
    const third = lim.take("a", t0 + 20);
    assert.equal(third.ok, true);
    assert.equal(third.remaining, 0);
    const blocked = lim.take("a", t0 + 30);
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterMs > 900);
    assert.equal(lim.take("b", t0 + 30).ok, true);
    assert.equal(lim.take("a", t0 + 1001).ok, true);
  });
});
