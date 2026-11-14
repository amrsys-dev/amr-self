import { useState } from "react";
import { api } from "@/lib/client.ts";
import { deriveRecoveryKeys, derivePasswordKeys, encodeAuthKey, generateRecoveryCodes, type KdfParams, unwrapDataKey, wrapDataKey, type WrappedKey } from "@/lib/crypto.ts";
import { deriveRecoveryCandidates, encodedVerifyKeys, recoveryKdfList } from "@/lib/auth/recovery-client.ts";
import { checkPassword } from "@/lib/password-policy.ts";
import type { MsgKey } from "@/lib/i18n.ts";
import type { SessionState } from "./types.ts";

export function RecoveryForm({
  t,
  nick,
  setNick,
  recovery,
  setRecovery,
  password,
  setPassword,
  password2,
  setPassword2,
  err,
  busy,
  recoveryCount,
  onDone,
  onError,
}: {
  t: (k: MsgKey) => string;
  nick: string;
  setNick: (s: string) => void;
  recovery: string;
  setRecovery: (s: string) => void;
  password: string;
  setPassword: (s: string) => void;
  password2: string;
  setPassword2: (s: string) => void;
  err: string;
  busy: boolean;
  recoveryCount: number;
  onDone: (s: SessionState, key: Uint8Array, newRecoveryCodes?: string[]) => void;
  onError: (status: number, data: { error?: string }) => void;
}) {
  const [localBusy, setLocalBusy] = useState(false);
  async function go() {
    if (password !== password2) return;
    const policy = checkPassword(password, nick);
    if (!policy.ok) {
      onError(400, { error: policy.reason === "short" ? "password_short" : "password_weak" });
      return;
    }
    setLocalBusy(true);
    try {
      const kdfRes = await api<{ kdf: KdfParams; kdfs?: KdfParams[] }>("/api/auth/kdf", {
        method: "POST",
        body: JSON.stringify({ nick, purpose: "recovery" }),
      });
      if (!kdfRes.ok) {
        onError(kdfRes.status, kdfRes.data as { error?: string });
        return;
      }
      const kdfs = recoveryKdfList(kdfRes.data);
      if (!kdfs.length) {
        onError(kdfRes.status, { error: "invalid" });
        return;
      }
      const candidates = await deriveRecoveryCandidates(recovery, kdfs);
      const verifyKeys = encodedVerifyKeys(candidates);
      const first = await api<{ wrapRecovery: WrappedKey; needsPassword?: boolean; nick?: string; kdf?: { password: KdfParams; recovery: KdfParams } }>(
        "/api/auth/recovery",
        {
          method: "POST",
          body: JSON.stringify({ nick, recoveryVerifyKey: verifyKeys[0], recoveryVerifyKeys: verifyKeys, phase: "unlock" }),
        },
      );
      if (!first.ok || !first.data.wrapRecovery) {
        onError(first.status, first.data as { error?: string });
        return;
      }
      let key: Uint8Array | null = null;
      for (const c of candidates) {
        try {
          key = await unwrapDataKey(first.data.wrapRecovery, c.wrapKey);
          break;
        } catch {
          /* try the next salt */
        }
      }
      if (!key) {
        onError(400, { error: "invalid" });
        return;
      }
      const count = recoveryCount >= 1 && recoveryCount <= 10 ? recoveryCount : 10;
      const newCodes = generateRecoveryCodes(count);
      const pwd = await derivePasswordKeys(password);
      const recNews = [];
      for (const c of newCodes) recNews.push(await deriveRecoveryKeys(c));
      const wrapPassword = await wrapDataKey(key, pwd.wrapKey);
      const wrapRecoveries = [];
      for (const k of recNews) wrapRecoveries.push(await wrapDataKey(key, k.wrapKey));
      const second = await api<SessionState>("/api/auth/recovery", {
        method: "POST",
        body: JSON.stringify({
          nick,
          recoveryVerifyKey: verifyKeys[0],
          recoveryVerifyKeys: verifyKeys,
          authKey: encodeAuthKey(pwd.authKey),
          wrapPassword,
          wrapRecovery: wrapRecoveries[0],
          wrapRecoveries,
          recoveryVerifyKeyNew: encodeAuthKey(recNews[0]!.verifyKey),
          recoveryVerifyKeysNew: recNews.map((k) => encodeAuthKey(k.verifyKey)),
          kdfPassword: pwd.params,
          kdfRecovery: recNews[0]!.params,
          kdfRecoveries: recNews.map((k) => k.params),
          phase: "reset",
        }),
      });
      if (!second.ok) {
        onError(second.status, second.data as { error?: string });
        return;
      }
      onDone(second.data, key, newCodes);
    } catch {
      onError(400, { error: "invalid" });
    } finally {
      setLocalBusy(false);
    }
  }
  return (
    <>
      <div className="field">
        <label>{t("nick")}</label>
        <div className="box">
          <input value={nick} onChange={(e) => setNick(e.target.value)} autoCapitalize="off" />
        </div>
      </div>
      <div className="field">
        <label>{t("recovery_code")}</label>
        <div className="box">
          <input value={recovery} onChange={(e) => setRecovery(e.target.value)} autoCapitalize="off" />
        </div>
      </div>
      <div className="field">
        <label>{t("new_password")}</label>
        <div className="box">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>{t("password_again")}</label>
        <div className="box">
          <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
        </div>
      </div>
      {err ? <div className="err">{err}</div> : null}
      <div className="btns">
        <p className="hint">{t("password_hint")}</p>
        <button className={`btn p ${localBusy || busy || !checkPassword(password, nick).ok || password !== password2 ? "off" : ""}`} type="button" onClick={() => void go()}>
          {t("recover")}
        </button>
      </div>
    </>
  );
}
