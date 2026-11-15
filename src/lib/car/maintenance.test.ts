import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOdometerRollback, itemState, nextDue, parseKm } from "./maintenance.ts";

describe("km left until a replacement", () => {
  it("engine oil changed at 50 000, every 10 000, now 56 000 -> 4 000 left", () => {
    const s = itemState({ lastKm: 50000, intervalKm: 10000 }, 56000);
    assert.deepEqual(s, { nextKm: 60000, leftKm: 4000, used: 0.6, status: "ok" });
  });

  it("is 'soon' inside the last 10 % (at least 1 000 km)", () => {
    assert.equal(itemState({ lastKm: 50000, intervalKm: 10000 }, 59200).status, "soon");
    assert.equal(itemState({ lastKm: 0, intervalKm: 60000 }, 54500).status, "soon");
    assert.equal(itemState({ lastKm: 0, intervalKm: 60000 }, 53000).status, "ok");
  });

  it("is overdue past the mark, with negative km left and a full bar", () => {
    const s = itemState({ lastKm: 50000, intervalKm: 10000 }, 61200);
    assert.equal(s.leftKm, -1200);
    assert.equal(s.status, "overdue");
    assert.equal(s.used, 1);
  });

  it("picks the item that needs attention first and skips deleted ones", () => {
    const items = [
      { id: "gear", lastKm: 40000, intervalKm: 60000 },
      { id: "oil", lastKm: 50000, intervalKm: 10000 },
      { id: "gone", lastKm: 0, intervalKm: 1000, deleted: true },
    ];
    assert.equal(nextDue(items, 56000)?.item.id, "oil");
    assert.equal(nextDue([], 56000), null);
  });
});

describe("typing the mileage", () => {
  it("accepts spaces and separators", () => {
    assert.equal(parseKm("56 000"), 56000);
    assert.equal(parseKm("56,000"), 56000);
    assert.equal(parseKm("120000"), 120000);
  });
  it("rejects nonsense and negatives", () => {
    assert.equal(parseKm(""), null);
    assert.equal(parseKm("-5"), null);
    assert.equal(parseKm("abc"), null);
  });
  it("flags a reading lower than the last one", () => {
    assert.equal(isOdometerRollback(56000, 5600), true);
    assert.equal(isOdometerRollback(56000, 56100), false);
  });
});
