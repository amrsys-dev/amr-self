import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newDeviceKey, seal, unseal } from "./device-store.ts";

describe("device seal", () => {
  it("round-trips bytes with the same label", async () => {
    const key = await newDeviceKey();
    const data = crypto.getRandomValues(new Uint8Array(32));
    const sealed = await seal(key, data, "data-key:acc1");
    assert.deepEqual(await unseal(key, sealed, "data-key:acc1"), data);
  });

  it("refuses a different label, so one account's key cannot open another's", async () => {
    const key = await newDeviceKey();
    const sealed = await seal(key, new Uint8Array([1, 2, 3]), "data-key:acc1");
    await assert.rejects(unseal(key, sealed, "data-key:acc2"));
  });

  it("refuses another device's key", async () => {
    const sealed = await seal(await newDeviceKey(), new Uint8Array([1, 2, 3]), "guest-data");
    await assert.rejects(unseal(await newDeviceKey(), sealed, "guest-data"));
  });

  it("does not let the key bytes be exported", async () => {
    const key = await newDeviceKey();
    assert.equal(key.extractable, false);
    await assert.rejects(crypto.subtle.exportKey("raw", key));
  });
});
