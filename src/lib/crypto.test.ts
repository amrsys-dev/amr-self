import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARGON2_PARAMS,
  HKDF_AUTH,
  HKDF_WRAP,
  compressAndEncrypt,
  decryptAndDecompress,
  derivePasswordKeys,
  deriveRecoveryKeys,
  encodeAad,
  encodeAuthKey,
  generateDataKey,
  generateRecoveryCode,
  hkdfLabel,
  normalizeRecoveryCode,
  recoveryCodeCompact,
  unwrapDataKey,
  wrapDataKey,
} from "./crypto.ts";
import { argon2idMaster } from "./crypto.ts";
import { unb64url } from "./crypto.ts";

describe("argon2id wrap/unwrap + HKDF labels", () => {
  it("wraps a random data key with argon2id→HKDF password material and unwraps it", async () => {
    const dataKey = await generateDataKey();
    const pwd = await derivePasswordKeys("correct-battery-horse");
    assert.equal(pwd.params.alg, "argon2id");
    assert.equal(pwd.params.memorySize, ARGON2_PARAMS.memorySize);
    assert.equal(pwd.wrapKey.length, 32);
    assert.equal(pwd.authKey.length, 32);
    assert.notDeepEqual(pwd.wrapKey, pwd.authKey);
    const wrapped = await wrapDataKey(dataKey, pwd.wrapKey);
    const opened = await unwrapDataKey(wrapped, pwd.wrapKey);
    assert.deepEqual(opened, dataKey);
    const wrong = await derivePasswordKeys("wrong-password-x", unb64url(pwd.params.salt));
    await assert.rejects(() => unwrapDataKey(wrapped, wrong.wrapKey));
  });

  it("derives distinct wrap and auth keys from the same password", async () => {
    const salt = unb64url("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    const a = await derivePasswordKeys("same-password-ok", salt);
    const b = await derivePasswordKeys("same-password-ok", salt);
    assert.deepEqual(a.wrapKey, b.wrapKey);
    assert.deepEqual(a.authKey, b.authKey);
    const master = await argon2idMaster("same-password-ok", salt);
    assert.deepEqual(a.wrapKey, hkdfLabel(master, HKDF_WRAP));
    assert.deepEqual(a.authKey, hkdfLabel(master, HKDF_AUTH));
    // The server must receive only the auth key, never the wrap key or password.
    assert.equal(encodeAuthKey(a.authKey).includes("same-password"), false);
  });

  it("wraps the same data key with the recovery code using a different HKDF label", async () => {
    const dataKey = await generateDataKey();
    const recovery = generateRecoveryCode();
    const pwd = await derivePasswordKeys("pw-one-long");
    const rec = await deriveRecoveryKeys(recovery);
    const fromPwd = await unwrapDataKey(await wrapDataKey(dataKey, pwd.wrapKey), pwd.wrapKey);
    const fromRec = await unwrapDataKey(
      await wrapDataKey(dataKey, rec.wrapKey),
      (await deriveRecoveryKeys(normalizeRecoveryCode(recovery.toLowerCase()), unb64url(rec.params.salt))).wrapKey,
    );
    assert.deepEqual(fromPwd, dataKey);
    assert.deepEqual(fromRec, dataKey);
    assert.notDeepEqual(rec.wrapKey, rec.verifyKey);
  });

  it("lets the recovery code re-wrap after a password reset and issues a new recovery code", async () => {
    const dataKey = await generateDataKey();
    const oldCode = generateRecoveryCode();
    const oldRec = await deriveRecoveryKeys(oldCode);
    const opened = await unwrapDataKey(await wrapDataKey(dataKey, oldRec.wrapKey), oldRec.wrapKey);
    const newPwd = await derivePasswordKeys("new-password-ok");
    const again = await unwrapDataKey(await wrapDataKey(opened, newPwd.wrapKey), newPwd.wrapKey);
    assert.deepEqual(again, dataKey);
    const newCode = generateRecoveryCode();
    assert.notEqual(recoveryCodeCompact(newCode), recoveryCodeCompact(oldCode));
    const newRec = await deriveRecoveryKeys(newCode);
    const fromNew = await unwrapDataKey(await wrapDataKey(dataKey, newRec.wrapKey), newRec.wrapKey);
    assert.deepEqual(fromNew, dataKey);
    const oldAgain = await deriveRecoveryKeys(oldCode, unb64url(oldRec.params.salt));
    // Old recovery still unwraps the *old* wrap, but the new wrap uses a different key.
    const newWrap = await wrapDataKey(dataKey, newRec.wrapKey);
    await assert.rejects(() => unwrapDataKey(newWrap, oldAgain.wrapKey));
  });
});

describe("XChaCha20-Poly1305 + AAD", () => {
  it("roundtrips a small object with AAD = account id + version", async () => {
    const dataKey = await generateDataKey();
    const payload = { v: 1, finance: { gigs: [] }, note: "привет مرحبا" };
    const aad = { accountId: "@AMR-417-283", version: 3 };
    const blob = await compressAndEncrypt(dataKey, payload, aad);
    assert.equal(blob.alg, "xchacha20poly1305");
    assert.ok(blob.ct.length > 0);
    const back = await decryptAndDecompress(dataKey, blob, aad);
    assert.deepEqual(back, payload);
  });

  it("rejects decryption when AAD (account id or version) does not match", async () => {
    const dataKey = await generateDataKey();
    const blob = await compressAndEncrypt(dataKey, { ok: true }, { accountId: "n1", version: 1 });
    await assert.rejects(() => decryptAndDecompress(dataKey, blob, { accountId: "n1", version: 2 }));
    await assert.rejects(() => decryptAndDecompress(dataKey, blob, { accountId: "n2", version: 1 }));
    const other = await generateDataKey();
    await assert.rejects(() => decryptAndDecompress(other, blob, { accountId: "n1", version: 1 }));
  });

  it("encodes AAD as accountId:version", () => {
    assert.equal(new TextDecoder().decode(encodeAad({ accountId: "@AMR-1", version: 7 })), "@AMR-1:7");
  });
});
