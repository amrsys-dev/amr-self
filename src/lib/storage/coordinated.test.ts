import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStores } from "./memory.ts";
import { createCoordinatedKvStore, isCoordinatedKey } from "./coordinated.ts";

describe("coordinated kv", () => {
  it("classifies nick, reserved, and data-version keys", () => {
    assert.equal(isCoordinatedKey("nick:@amr-1-1"), true);
    assert.equal(isCoordinatedKey("reserved:@amr-1-1"), true);
    assert.equal(isCoordinatedKey("user/AMR-1-1/data-version"), true);
    assert.equal(isCoordinatedKey("session:abc"), false);
    assert.equal(isCoordinatedKey("otp:abc"), false);
    assert.equal(isCoordinatedKey("ratelimit:login:ip"), false);
  });

  it("CAS-claims a nick in the DO and write-through to KV, rejecting a second claim", async () => {
    const durable = createMemoryStores().kv;
    const persistent = createMemoryStores().kv;
    const kv = createCoordinatedKvStore(durable, persistent);
    assert.equal(await kv.compareAndSet("nick:@amr-1-1", null, "user-a"), true);
    assert.equal(await durable.get("nick:@amr-1-1"), "user-a");
    assert.equal(await persistent.get("nick:@amr-1-1"), "user-a");
    assert.equal(await kv.compareAndSet("nick:@amr-1-1", null, "user-b"), false);
    assert.equal(await kv.get("nick:@amr-1-1"), "user-a");
  });

  it("skips a put when the value is unchanged", async () => {
    const durable = createMemoryStores().kv;
    const persistent = createMemoryStores().kv;
    let puts = 0;
    const counting: typeof persistent = {
      ...persistent,
      async put(key, value, opts) {
        puts += 1;
        return persistent.put(key, value, opts);
      },
    };
    const kv = createCoordinatedKvStore(durable, counting);
    await kv.put("session:1", "a");
    await kv.put("session:1", "a");
    await kv.put("nick:@amr-2-2", "u");
    await kv.put("nick:@amr-2-2", "u");
    assert.equal(puts, 2);
    await kv.put("session:1", "b");
    assert.equal(puts, 3);
  });

  it("hydrates the DO from KV after a cold start", async () => {
    const durable = createMemoryStores().kv;
    const persistent = createMemoryStores().kv;
    await persistent.put("nick:@amr-3-3", "user-c");
    const kv = createCoordinatedKvStore(durable, persistent);
    assert.equal(await kv.get("nick:@amr-3-3"), "user-c");
    assert.equal(await durable.get("nick:@amr-3-3"), "user-c");
    assert.equal(await kv.compareAndSet("nick:@amr-3-3", null, "user-d"), false);
  });
});
