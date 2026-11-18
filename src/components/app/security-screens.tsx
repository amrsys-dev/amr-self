import { useEffect, useState } from "react";
import type { MsgKey } from "@/lib/i18n.ts";
import { NickInput, NickStatusLine } from "./auth-screens.tsx";
import { Header, TestBanner, CodeBoxes } from "./ui.tsx";
import type { App } from "./use-id-app.ts";

/** Nick change, 2FA channel change, account deletion, 2FA rebind. */
export function SecurityScreens({ app }: { app: App }) {
  const { t, lang, screen, setScreen, session, err, busy, testOtp, nick, setNick, password, setPassword, otpId, code, setCode, recovery, setRecovery, reauthPassword, setReauthPassword, newNick, setNewNick, newNickStatus, rebindDest, setRebindDest, checkNickStatus, submitNickChange, submitChannelChange, submitDeleteAccount, submitRebind, sendDeleteCode, deleteResendAt, deleteMethod, deleteGoogleReady, googleAction, googleProof, googleResendAt, sendGoogleCode, submitGoogleLink } = app;
  return (
    <>
    {session && screen === "nick-change" && (
      <>
        <Header title={t("nick")} onBack={() => setScreen("profile")} />
        <div className="page auth">
          <div className="kicker">{t("profile_sec")}</div>
          <h1>{t("change_nick")}</h1>
          <p className="sub">{t("nick_now")}: {session.nick}</p>
          <div className="field">
            <label>{t("new_nick_label")}</label>
            <div className="box">
              <NickInput
                value={newNick}
                onChange={(v) => {
                  setNewNick(v);
                  void checkNickStatus(v);
                }}
              />
            </div>
            <NickStatusLine status={newNickStatus} lang={lang} />
          </div>
          <p className="hint">{t("nick_suffix_hint")}</p>
          <div className="note">{t("nick_change_hint")}</div>
          <div className="field">
            <label>{t("password")}</label>
            <div className="box">
              <input type="password" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} />
            </div>
          </div>
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <button className="btn g" type="button" onClick={() => setScreen("profile")}>{t("cancel")}</button>
            <button
              className={`btn p ${busy || newNickStatus !== "free" || reauthPassword.length < 8 ? "off" : ""}`}
              type="button"
              onClick={() => void submitNickChange()}
            >
              {t("change_nick_once")}
            </button>
          </div>
        </div>
      </>
    )}

    {session && screen === "sec-2fa-change" && (
      <>
        <Header title={t("login_code")} onBack={() => setScreen("profile")} />
        <div className="page auth">
          <div className="kicker">{t("security")}</div>
          <h1>{t("change_channel")}</h1>
          <p className="sub">{t("change_channel_sub")}</p>
          <div className="card pad0">
            <div className="row">
              <span className="glyph ico">TG</span>
              <div className="txt">
                <b>{t("channel_now")}</b>
                <span>Telegram</span>
              </div>
            </div>
            <div className="row">
              <span className="glyph ico">TG</span>
              <div className="txt">
                <b>{t("channel_new")}</b>
                <span>Telegram · {t("verified_by_code")}</span>
              </div>
            </div>
          </div>
          <div className="field">
            <label>{t("password")}</label>
            <div className="box">
              <input type="password" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>{t("code_from_tg")}</label>
            <CodeBoxes value={code} onChange={setCode} />
          </div>
          {testOtp ? <TestBanner code={testOtp} t={t} /> : null}
          <div className="note">{t("change_channel_hint")}</div>
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <button className={`btn p ${busy ? "off" : ""}`} type="button" onClick={() => void submitChannelChange()}>
              {t("change")}
            </button>
          </div>
        </div>
      </>
    )}

    {session && screen === "account-delete" && (
      <>
        <Header title={t("deletion")} onBack={() => setScreen("profile")} />
        <div className="page auth center-copy">
          <div className="danger-ico">×</div>
          <h1>{t("delete_account")}</h1>
          <p className="sub">{t("delete_wipe_a")} {session.nick}, {t("delete_wipe_b")}</p>
          <p className="hint">{t("backup_hint")}</p>
          {deleteMethod === "password" ? (
            <div className="field" style={{ textAlign: "start" }}>
              <label>{t("delete_password")}</label>
              <div className="box">
                <input type="password" autoComplete="current-password" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} />
              </div>
            </div>
          ) : deleteMethod === "google" ? (
            <div className="note">{deleteGoogleReady ? t("delete_google_ok") : t("delete_google_hint")}</div>
          ) : deleteMethod === "telegram" ? (
            <>
              <div className="field" style={{ textAlign: "start" }}>
                <label>{t("code_from_tg")}</label>
                <CodeBoxes value={code} onChange={setCode} />
              </div>
              {testOtp ? <TestBanner code={testOtp} t={t} /> : otpId ? <div className="note">{t("delete_code_sent")}</div> : null}
              <ResendButton at={deleteResendAt} busy={busy} onClick={() => void sendDeleteCode()} t={t} />
            </>
          ) : null}
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <button className="btn g" type="button" onClick={() => setScreen("profile")}>{t("cancel")}</button>
            <button className={`btn bad ${busy ? "off" : ""}`} type="button" onClick={() => void submitDeleteAccount()}>
              {deleteMethod === "google" && !deleteGoogleReady ? t("delete_google_btn") : t("delete_action")}
            </button>
          </div>
        </div>
      </>
    )}

    {session && screen === "google-link" && (
      <>
        <Header title={googleAction === "link" ? t("google_link") : t("google_unlink")} onBack={() => setScreen("profile")} />
        <div className="page auth center-copy">
          <p className="sub">{googleAction === "link" ? t("google_link_hint") : t("google_unlink_hint")}</p>
          {googleProof === "password" ? (
            <div className="field" style={{ textAlign: "start" }}>
              <label>{t("delete_password")}</label>
              <div className="box">
                <input type="password" autoComplete="current-password" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} />
              </div>
            </div>
          ) : googleProof === "telegram" ? (
            <>
              <div className="field" style={{ textAlign: "start" }}>
                <label>{t("code_from_tg")}</label>
                <CodeBoxes value={code} onChange={setCode} />
              </div>
              {testOtp ? <TestBanner code={testOtp} t={t} /> : otpId ? <div className="note">{t("delete_code_sent")}</div> : null}
              <ResendButton at={googleResendAt} busy={busy} onClick={() => void sendGoogleCode()} t={t} />
            </>
          ) : null}
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <button className="btn g" type="button" onClick={() => setScreen("profile")}>{t("cancel")}</button>
            <button className={`btn p ${busy ? "off" : ""}`} type="button" onClick={() => void submitGoogleLink()}>
              {googleAction === "link" ? t("google_continue") : t("google_unlink")}
            </button>
          </div>
        </div>
      </>
    )}

    {screen === "rebind-2fa" && (
      <>
        <Header title={t("rebind_2fa")} onBack={() => setScreen("login")} />
        <div className="page auth">
          <p className="sub">{t("rebind_hint")}</p>
          <div className="field">
            <label>{t("nick")}</label>
            <div className="box">
              <NickInput value={nick} onChange={setNick} />
            </div>
          </div>
          <div className="field">
            <label>{t("password")}</label>
            <div className="box">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>{t("recovery_code")}</label>
            <div className="box">
              <input value={recovery} onChange={(e) => setRecovery(e.target.value)} autoCapitalize="off" />
            </div>
          </div>
          <div className="field">
            <label>{t("dest_tg")}</label>
            <div className="box">
              <input value={rebindDest} onChange={(e) => setRebindDest(e.target.value)} autoCapitalize="off" />
            </div>
          </div>
          {otpId ? (
            <div className="field">
              <label>{t("code_from_tg")}</label>
              <CodeBoxes value={code} onChange={setCode} />
            </div>
          ) : null}
          <TestBanner code={testOtp} t={t} />
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <button className={`btn p ${busy ? "off" : ""}`} type="button" onClick={() => void submitRebind()}>
              {otpId ? t("change") : t("send_code")}
            </button>
          </div>
        </div>
      </>
    )}
    </>
  );
}

/** «Отправить код ещё раз», available 60 s after the last code. */
function ResendButton({ at, busy, onClick, t }: { at: number; busy: boolean; onClick: () => void; t: (k: MsgKey) => string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (at <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [at, now]);
  const left = Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <button className={`btn g ${busy || left > 0 ? "off" : ""}`} type="button" disabled={busy || left > 0} onClick={onClick} style={{ marginTop: 10 }}>
      {left > 0 ? t("delete_resend_in").replace("{s}", String(left)) : t("delete_resend")}
    </button>
  );
}
