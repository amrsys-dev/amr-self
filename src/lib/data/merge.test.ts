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

  it("drops a record marked deleted when that write is newer", () => {
    const kept = mergeRecordList([rec("1", "2026-01-01T00:00:00.000Z")], [rec("1", "2026-01-02T00:00:00.000Z", { deleted: true })]);
    assert.equal(kept.length, 0);
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
