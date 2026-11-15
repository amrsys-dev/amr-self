import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeRecordList, mergeUserData } from "./merge.ts";
import { emptyUserData, type DataRecord } from "./schema.ts";

function rec(id: string, updatedAt: string, extra: Record<string, unknown> = {}): DataRecord {
  return { id, updatedAt, ...extra };
}

describe("per-record merge on If-Match conflict", () => {
  it("keeps the newer row for the same id and unions distinct ids", () => {
    const a = [rec("1", "2026-01-01T00:00:00.000Z", { n: 1 }), rec("2", "2026-01-02T00:00:00.000Z")];
    const b = [rec("1", "2026-02-01T00:00:00.000Z", { n: 2 }), rec("3", "2026-01-03T00:00:00.000Z")];
    const merged = mergeRecordList(a, b);
    assert.deepEqual(
      merged.map((x) => x.id).sort(),
      ["1", "2", "3"],
    );
    assert.equal((merged.find((x) => x.id === "1") as unknown as { n: number }).n, 2);
  });

  it("retains a newer deletion tombstone to prevent stale replicas resurrecting a row", () => {
    const deleted = rec("1", "2026-01-02T00:00:00.000Z", { deleted: true });
    const merged = mergeRecordList([rec("1", "2026-01-01T00:00:00.000Z")], [deleted]);
    assert.deepEqual(merged, [deleted]);
    assert.deepEqual(mergeRecordList(merged, [rec("1", "2026-01-01T00:00:00.000Z")]), [deleted]);
  });

  it("merges UserData collections independently", () => {
    const local = emptyUserData();
    const remote = emptyUserData();
    local.work.tasks = [rec("t-local", "2026-03-01T00:00:00.000Z")];
    remote.work.tasks = [rec("t-remote", "2026-03-02T00:00:00.000Z")];
    local.finance.gigs = [rec("g1", "2026-04-01T00:00:00.000Z", { title: "old" })];
    remote.finance.gigs = [rec("g1", "2026-05-01T00:00:00.000Z", { title: "new" })];
    const out = mergeUserData(local, remote);
    assert.equal(out.work.tasks.length, 2);
    assert.equal((out.finance.gigs[0] as unknown as { title: string }).title, "new");
  });
});


describe("extended SELF personal records", () => {
  it("preserves typed finance, task and health fields across a merge", () => {
    const local = emptyUserData();
    const remote = emptyUserData();
    local.finance.income.push({
      id: "inc-1", updatedAt: "2026-11-14T08:00:00.000Z",
      title: "Furniture order", amount: 450, currency: "SAR", category: "freelance", date: "2026-11-14",
    });
    remote.work.tasks.push({
      id: "task-1", updatedAt: "2026-11-14T09:00:00.000Z",
      title: "Prepare estimate", dueDate: "2026-11-14", priority: "high", completed: true,
    });
    local.health!.water.push({
      id: "water-1", updatedAt: "2026-11-14T10:00:00.000Z",
      kind: "water", title: "Water", date: "2026-11-14", amount: 250, unit: "ml",
    });

    const merged = mergeUserData(local, remote);
    assert.equal(merged.finance.income[0]?.amount, 450);
    assert.equal(merged.finance.income[0]?.currency, "SAR");
    assert.equal(merged.work.tasks[0]?.priority, "high");
    assert.equal(merged.work.tasks[0]?.completed, true);
    assert.equal(merged.health?.water[0]?.amount, 250);
  });

  it("upgrades legacy records without a health property to an empty health model", () => {
    const legacy = emptyUserData();
    delete (legacy as { health?: typeof legacy.health }).health;
    const merged = mergeUserData(legacy, emptyUserData());
    assert.deepEqual(merged.health, { water: [], weight: [], nutrition: [], workouts: [] });
  });
});

describe("car data across devices", () => {
  it("keeps the newer odometer reading and items from both phones", () => {
    const a = emptyUserData();
    const b = emptyUserData();
    a.car = { vehicles: [{ id: "v", updatedAt: "2026-11-10T00:00:00.000Z", name: "Camry", odometer: 55000, odometerDate: "2026-11-10" }], items: [{ id: "oil", updatedAt: "2026-11-01T00:00:00.000Z", kind: "engine_oil", intervalKm: 10000, lastKm: 50000 }], log: [] };
    b.car = { vehicles: [{ id: "v", updatedAt: "2026-11-14T00:00:00.000Z", name: "Camry", odometer: 56000, odometerDate: "2026-11-14" }], items: [{ id: "gear", updatedAt: "2026-11-02T00:00:00.000Z", kind: "gear_oil", intervalKm: 60000, lastKm: 40000 }], log: [] };
    const out = mergeUserData(a, b);
    assert.equal(out.car!.vehicles[0]!.odometer, 56000);
    assert.deepEqual(out.car!.items.map((i) => i.id).sort(), ["gear", "oil"]);
  });

  it("reads data saved before the car section existed", () => {
    const old = emptyUserData();
    delete old.car;
    assert.deepEqual(mergeUserData(old, old).car, { vehicles: [], items: [], log: [] });
  });
});
