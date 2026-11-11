import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { b64ToBytes, bytesToB64, sameBytes } from "./bytes.ts";

describe("blob transfer bytes", () => {
  it("roundtrips and compares byte arrays", () => {
    const raw = new Uint8Array([0, 1, 2, 255, 10]);
    const back = b64ToBytes(bytesToB64(raw));
    assert.equal(sameBytes(raw, back), true);
    assert.equal(sameBytes(raw, new Uint8Array([0, 1, 2, 255, 11])), false);
    assert.equal(sameBytes(raw, new Uint8Array([0, 1, 2])), false);
  });
});
