import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { live, mergeRecordList, mergeUserData } from "./merge.ts";
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

  it("keeps a newer deletion as a tombstone, hidden by live()", () => {
    const now = Date.parse("2026-01-03T00:00:00.000Z");
    const kept = mergeRecordList([rec("1", "2026-01-01T00:00:00.000Z")], [rec("1", "2026-01-02T00:00:00.000Z", { deleted: true })], now);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]!.deleted, true);
    assert.equal(live(kept).length, 0);
  });

  it("does not bring a deleted row back from a device that still has the old copy", () => {
    const now = Date.parse("2026-01-05T00:00:00.000Z");
    const phoneB = [rec("1", "2026-01-01T00:00:00.000Z")];
    const afterDelete = mergeRecordList(phoneB, [rec("1", "2026-01-02T00:00:00.000Z", { deleted: true })], now);
    const afterNextSync = mergeRecordList(afterDelete, phoneB, now);
    assert.equal(live(afterNextSync).length, 0);
  });

  it("prunes tombstones after the retention period", () => {
    const now = Date.parse("2026-12-01T00:00:00.000Z");
    const out = mergeRecordList([rec("1", "2026-01-01T00:00:00.000Z", { deleted: true })], [], now);
    assert.equal(out.length, 0);
  });

  it("merges UserData collections independently", () => {
    const local = emptyUserData();
    const remote = emptyUserData();
    local.work.tasks = [rec("t-local", "2026-03-01T00:00:00.000Z")];
    remote.work.tasks = [rec("t-remote", "2026-03-02T00:00:00.000Z")];
    local.finance.plannedIncome = [rec("g1", "2026-04-01T00:00:00.000Z", { title: "old" }) as never];
    remote.finance.plannedIncome = [rec("g1", "2026-05-01T00:00:00.000Z", { title: "new" }) as never];
    const out = mergeUserData(local, remote);
    assert.equal(out.work.tasks.length, 2);
    assert.equal((out.finance.plannedIncome[0] as unknown as { title: string }).title, "new");
  });
});
