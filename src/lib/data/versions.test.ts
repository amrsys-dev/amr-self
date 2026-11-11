import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStores } from "../storage/memory.ts";
import { dataBlobKey, dataVersionBlobKey } from "../user.ts";
import { DATA_VERSIONS_KEPT, ifMatchOk, listRetainedVersionBlobs, putVersionedBlob } from "./versions.ts";

describe("If-Match + version retention", () => {
  it("accepts the first write and rejects a stale If-Match", async () => {
    const { blobs } = createMemoryStores();
    const first = await putVersionedBlob({
      blobs,
      nick: "@AMR-1",
      bytes: new Uint8Array([1]),
      currentVersion: 0,
      ifMatch: "0",
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.version, 1);
    const stale = await putVersionedBlob({
      blobs,
      nick: "@AMR-1",
      bytes: new Uint8Array([2]),
      currentVersion: 1,
      ifMatch: "0",
    });
    assert.equal(stale.ok, false);
    if (stale.ok) return;
    assert.equal(stale.conflict, true);
    assert.equal(stale.version, 1);
    assert.deepEqual(stale.blob, new Uint8Array([1]));
    const next = await putVersionedBlob({
      blobs,
      nick: "@AMR-1",
      bytes: new Uint8Array([3]),
      currentVersion: 1,
      ifMatch: "1",
    });
    assert.equal(next.ok, true);
    if (!next.ok) return;
    assert.equal(next.version, 2);
    assert.deepEqual(await blobs.get(dataBlobKey("@AMR-1")), new Uint8Array([3]));
  });

  it(`keeps only the last ${DATA_VERSIONS_KEPT} versioned blobs`, async () => {
    const { blobs } = createMemoryStores();
    let current = 0;
    for (let i = 0; i < 7; i++) {
      const res = await putVersionedBlob({
        blobs,
        nick: "AMR-2",
        bytes: new Uint8Array([i + 1]),
        currentVersion: current,
        ifMatch: String(current),
      });
      assert.equal(res.ok, true);
      if (res.ok) current = res.version;
    }
    assert.equal(current, 7);
    const kept = await listRetainedVersionBlobs(blobs, "AMR-2", current);
    assert.deepEqual(kept, [3, 4, 5, 6, 7]);
    assert.equal(await blobs.get(dataVersionBlobKey("AMR-2", 1)), null);
    assert.equal(await blobs.get(dataVersionBlobKey("AMR-2", 2)), null);
    assert.ok(await blobs.get(dataVersionBlobKey("AMR-2", 3)));
    assert.deepEqual(await blobs.get(dataBlobKey("AMR-2")), new Uint8Array([7]));
  });

  it("treats a missing If-Match as a conflict once a version exists", () => {
    assert.equal(ifMatchOk(0, null), true);
    assert.equal(ifMatchOk(3, null), false);
    assert.equal(ifMatchOk(3, "3"), true);
    assert.equal(ifMatchOk(3, '"3"'), true);
    assert.equal(ifMatchOk(3, "2"), false);
  });
});
