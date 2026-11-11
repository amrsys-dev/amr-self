/** Derive recovery verify/wrap keys against every stored KDF salt. */
import { deriveRecoveryKeys, encodeAuthKey, keysFromParams, type KdfParams } from "../crypto.ts";

export type RecoveryCandidate = Awaited<ReturnType<typeof deriveRecoveryKeys>>;

export async function deriveRecoveryCandidates(code: string, kdfs: KdfParams[]): Promise<RecoveryCandidate[]> {
  const out: RecoveryCandidate[] = [];
  for (const params of kdfs) {
    const { salt, opts } = keysFromParams(params);
    out.push(await deriveRecoveryKeys(code, salt, opts));
  }
  return out;
}

export function recoveryKdfList(payload: { kdf?: KdfParams; kdfs?: KdfParams[] }): KdfParams[] {
  if (payload.kdfs?.length) return payload.kdfs;
  return payload.kdf ? [payload.kdf] : [];
}

export function encodedVerifyKeys(candidates: RecoveryCandidate[]): string[] {
  return candidates.map((c) => encodeAuthKey(c.verifyKey));
}
