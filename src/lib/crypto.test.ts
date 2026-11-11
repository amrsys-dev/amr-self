import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compressAndEncrypt,
  decryptAndDecompress,
  generateDataKey,
  generateRecoveryCode,
  normalizeRecoveryCode,
  recoveryCodeCompact,
  unwrapKey,
  wrapKey,
} from "./crypto.ts";

describe("crypto wrap/unwrap + recovery", () => {
  it("wraps a data key with the password and unwraps it", async () => {
    const dataKey = await generateDataKey();
    const wrapped = await wrapKey(dataKey, "correct horse");
    const opened = await unwrapKey(wrapped, "correct horse");
    assert.deepEqual(opened, dataKey);
    await assert.rejects(() => unwrapKey(wrapped, "wrong password"));
  });

  it("wraps the same data key with the recovery code", async () => {
    const dataKey = await generateDataKey();
    const recovery = generateRecoveryCode();
    const wrappedPwd = await wrapKey(dataKey, "pw-one");
    const wrappedRec = await wrapKey(dataKey, recoveryCodeCompact(recovery));
    const fromPwd = await unwrapKey(wrappedPwd, "pw-one");
    const fromRec = await unwrapKey(wrappedRec, recoveryCodeCompact(normalizeRecoveryCode(recovery.toLowerCase())));
    assert.deepEqual(fromPwd, dataKey);
    assert.deepEqual(fromRec, dataKey);
  });

  it("lets the recovery code re-wrap after a password reset", async () => {
    const dataKey = await generateDataKey();
    const recovery = generateRecoveryCode();
    const recKey = recoveryCodeCompact(recovery);
    const wrappedRec = await wrapKey(dataKey, recKey);
    const opened = await unwrapKey(wrappedRec, recKey);
    const wrappedNew = await wrapKey(opened, "new-password");
    const again = await unwrapKey(wrappedNew, "new-password");
    assert.deepEqual(again, dataKey);
  });
});

describe("compression roundtrip", () => {
  it("gzip + AES-GCM roundtrips a small object", async () => {
    const dataKey = await generateDataKey();
    const payload = { v: 1, finance: { gigs: [] }, note: "привет مرحبا" };
    const blob = await compressAndEncrypt(dataKey, payload);
    assert.ok(blob.ct.length > 0);
    const back = await decryptAndDecompress(dataKey, blob);
    assert.deepEqual(back, payload);
    const other = await generateDataKey();
    await assert.rejects(() => decryptAndDecompress(other, blob));
  });
});
