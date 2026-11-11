import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AmrIdCoordinator } from "./do-core.ts";

describe("durable object coordinator", () => {
  it("CAS-claims a nick, rejects a stale If-Match, and expires rate-limit keys", () => {
    const c = new AmrIdCoordinator();
    assert.equal(c.compareAndSet("nick:@amr-1-1", null, "user-a"), true);
    assert.equal(c.compareAndSet("nick:@amr-1-1", null, "user-b"), false);
    assert.equal(c.get("nick:@amr-1-1"), "user-a");
    assert.equal(c.compareAndSet("ver:n", null, "1"), true);
    assert.equal(c.compareAndSet("ver:n", "0", "2"), false);
    assert.equal(c.compareAndSet("ver:n", "1", "2"), true);
    const t0 = 5_000_000;
    assert.equal(c.takeRateLimit("login:ip", 1000, 2, t0).ok, true);
    assert.equal(c.takeRateLimit("login:ip", 1000, 2, t0 + 1).ok, true);
    assert.equal(c.takeRateLimit("login:ip", 1000, 2, t0 + 2).ok, false);
    c.put("ttl", "x", { expirationTtl: 1 }, t0);
    assert.equal(c.get("ttl", t0 + 500), "x");
    assert.equal(c.get("ttl", t0 + 1500), null);
  });
});
