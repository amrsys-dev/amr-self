import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveRecoveryKeys, encodeAuthKey, generateRecoveryCode } from "../crypto.ts";
import { deriveRecoveryCandidates, encodedVerifyKeys, recoveryKdfList } from "./recovery-client.ts";

describe("recovery KDF candidates", () => {
  it("derives a verify key for every salt so recovery code #2 matches its own slot", async () => {
    const code = generateRecoveryCode();
    const first = await deriveRecoveryKeys(code);
    const second = await deriveRecoveryKeys(code);
    assert.notEqual(first.params.salt, second.params.salt);
    const kdfs = recoveryKdfList({ kdf: first.params, kdfs: [first.params, second.params] });
    assert.equal(kdfs.length, 2);
    const candidates = await deriveRecoveryCandidates(code, kdfs);
    assert.equal(candidates.length, 2);
    assert.equal(encodeAuthKey(candidates[0]!.verifyKey), encodeAuthKey(first.verifyKey));
    assert.equal(encodeAuthKey(candidates[1]!.verifyKey), encodeAuthKey(second.verifyKey));
    assert.notEqual(encodedVerifyKeys(candidates)[0], encodedVerifyKeys(candidates)[1]);
  });
});
