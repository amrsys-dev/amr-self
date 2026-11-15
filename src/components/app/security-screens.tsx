import { Header, TestBanner, CodeBoxes } from "./ui.tsx";
import type { App } from "./use-id-app.ts";

/** Nick change, 2FA channel change, account deletion, 2FA rebind. */
export function SecurityScreens({ app }: { app: App }) {
  const { t, screen, setScreen, session, err, busy, testOtp, nick, setNick, password, setPassword, otpId, code, setCode, recovery, setRecovery, reauthPassword, setReauthPassword, newNick, setNewNick, newNickStatus, rebindDest, setRebindDest, checkNickStatus, submitNickChange, submitChannelChange, submitDeleteAccount, submitRebind } = app;
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
              <input
                placeholder="murad"
                value={newNick.replace(/^@/, "")}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewNick(v);
                  void checkNickStatus(v);
                }}
                autoCapitalize="off"
              />
            </div>
            {newNickStatus ? (
              <div className={`nick-status ${newNickStatus === "free" ? "ok" : "bad"}`}>
                <span className="dot" />
                {newNickStatus === "free" ? t("nick_free") : t("nick_taken")}
              </div>
            ) : null}
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
          {testOtp ? <TestBanner code={testOtp} t={t} /> : <div className="ex-row"><span className="ex">{t("example")}</span></div>}
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
          <div className="field" style={{ textAlign: "start" }}>
            <label>{t("password")}</label>
            <div className="box">
              <input type="password" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ textAlign: "start" }}>
            <label>{t("code_from_tg")}</label>
            <CodeBoxes value={code} onChange={setCode} />
          </div>
          {testOtp ? <TestBanner code={testOtp} t={t} /> : <div className="ex-row"><span className="ex">{t("example")}</span> · {t("delete_need_both")}</div>}
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <button className="btn g" type="button" onClick={() => setScreen("profile")}>{t("cancel")}</button>
            <button className={`btn bad ${busy ? "off" : ""}`} type="button" onClick={() => void submitDeleteAccount()}>
              {t("delete_action")}
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
              <input value={nick} onChange={(e) => setNick(e.target.value)} autoCapitalize="off" />
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
