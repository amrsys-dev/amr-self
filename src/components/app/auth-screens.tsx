import { Header, TestBanner, LangPicker } from "./ui.tsx";
import { RecoveryForm } from "./recovery-form.tsx";
import { checkPassword } from "@/lib/password-policy.ts";
import type { App } from "./use-id-app.ts";

/** Welcome, sign-up, login, recovery. */
export function AuthScreens({ app }: { app: App }) {
  const { lang, setLang, t, screen, setScreen, setAppearance, meta, session, setSession, err, setErr, busy, testOtp, deepLink, nick, setNick, nickStatus, password, setPassword, password2, setPassword2, channel, setChannel, dest, setDest, setOtpId, code, setCode, recovery, setRecovery, recoveryCodes, setRecoveryCodes, ageConfirmed, setAgeConfirmed, dataKeyRef, fail, suggestNick, checkNick, submitSignup, submitOtp, submitLogin, startGuest } = app;
  return (
    <>
    {screen === "welcome" && (
      <>
        <Header />
        <div className="page auth">
          <div className="kicker">{t("kicker")}</div>
          <h1>{t("welcome_title")}</h1>
          <p className="sub">{t("welcome_sub")}</p>
          <div className="gap" />
          <div className="card hero" style={{ textAlign: "center" }}>
            <div className="tiny">{t("example_nick")}</div>
            <div className="nick" style={{ fontSize: 28 }}>
              @AMR-417-283
            </div>
          </div>
          <div className="btns">
            <button
              className="btn p"
              type="button"
              onClick={() => {
                void suggestNick();
                setScreen("signup-nick");
              }}
            >
              {t("create_id")}
            </button>
          </div>
          <div className="btns">
            <button className="btn g" type="button" onClick={() => setScreen("login")}>
              {t("have_id")}
            </button>
          </div>
          <div className="btns">
            <button className="link-quiet" type="button" onClick={startGuest}>
              {t("start_without_account")}
            </button>
          </div>
          <LangPicker lang={lang} setLang={setLang} t={t} />
        </div>
      </>
    )}

    {screen === "signup-nick" && (
      <>
        <Header title={t("create_id")} onBack={() => setScreen("welcome")} />
        <div className="page auth">
          <p className="sub">{t("your_id_name")}</p>
          <div className="field">
            <label>{t("nick")}</label>
            <div className="box">
              <input value={nick} onChange={(e) => void checkNick(e.target.value)} autoCapitalize="off" autoCorrect="off" />
            </div>
          </div>
          {nickStatus === "free" && (
            <div className="nick-status ok">
              <i className="dot" /> {t("nick_free")}
            </div>
          )}
          {nickStatus === "taken" && (
            <>
              <div className="nick-status bad">
                <i className="dot" /> {t("nick_taken")}
              </div>
              <p className="hint">{t("nick_taken_hint")}</p>
            </>
          )}
          <div className="btns">
            <button className="btn t" type="button" onClick={() => void suggestNick()}>
              {t("new_nick")}
            </button>
          </div>
          <div className="btns">
            <button className={`btn p ${nickStatus !== "free" ? "off" : ""}`} type="button" onClick={() => setScreen("signup-pass")}>
              {t("next")}
            </button>
          </div>
        </div>
      </>
    )}

    {screen === "signup-pass" && (
      <>
        <Header title={t("signup_create")} onBack={() => setScreen("signup-nick")} />
        <div className="page auth">
          <h1>{t("password")}</h1>
          <p className="sub">{t("password_hint")}</p>
          <div className="field">
            <label>{t("password")}</label>
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
          <button
            type="button"
            className={`check-row ${ageConfirmed ? "on" : ""}`}
            onClick={() => setAgeConfirmed((v) => !v)}
          >
            <span className="check">✓</span>
            {t("age_confirm")}
          </button>
          <p className="hint">{t("age_hint")}</p>
          {password && password2 && password !== password2 ? <div className="err">{t("mismatch")}</div> : null}
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <button
              className={`btn p ${checkPassword(password, nick).ok === false || password !== password2 || !ageConfirmed ? "off" : ""}`}
              type="button"
              onClick={() => {
                const policy = checkPassword(password, nick);
                if (!policy.ok) {
                  setErr(t(policy.reason === "short" ? "password_short" : "password_weak"));
                  return;
                }
                if (!ageConfirmed) {
                  setErr(t("age_hint"));
                  return;
                }
                setErr("");
                setScreen("signup-2fa");
              }}
            >
              {t("next")}
            </button>
          </div>
        </div>
      </>
    )}

    {screen === "signup-2fa" && (
      <>
        <Header title={t("second_factor")} onBack={() => setScreen("signup-pass")} />
        <div className="page auth">
          {meta?.emailOtp ? (
            <div className="seg">
              <button type="button" className={channel === "telegram" ? "on" : ""} onClick={() => setChannel("telegram")}>
                {t("telegram")}
              </button>
              <button type="button" className={channel === "email" ? "on" : ""} onClick={() => setChannel("email")}>
                {t("email")}
              </button>
            </div>
          ) : (
            <p className="hint">{t("telegram")}</p>
          )}
          <div className="field">
            <label>{channel === "telegram" ? t("dest_tg") : t("dest_email")}</label>
            <div className="box">
              <input value={dest} onChange={(e) => setDest(e.target.value)} autoCapitalize="off" />
            </div>
          </div>
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <button className={`btn p ${busy || dest.trim().length < 2 ? "off" : ""}`} type="button" onClick={() => void submitSignup()}>
              {t("send_code")}
            </button>
          </div>
        </div>
      </>
    )}

    {(screen === "signup-tg-link" || screen === "login-tg-link") && (
      <>
        <Header title={t("telegram")} onBack={() => setScreen(screen === "signup-tg-link" ? "signup-2fa" : "login")} />
        <div className="page auth">
          <p className="sub">{t("press_start")}</p>
          <p className="hint">{t("waiting_bot")}</p>
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <a className="btn p" href={deepLink} target="_blank" rel="noreferrer">
              {t("open_bot")}
            </a>
          </div>
        </div>
      </>
    )}

    {(screen === "signup-code" || screen === "login-2fa") && (
      <>
        <Header title={t("enter_code")} onBack={() => setScreen(screen === "signup-code" ? "signup-2fa" : "login")} />
        <div className="page auth">
          <TestBanner code={testOtp} t={t} />
          <div className="field">
            <label>{t("enter_code")}</label>
            <div className="box">
              <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} />
            </div>
          </div>
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <button
              className={`btn p ${busy || code.replace(/\s/g, "").length < 6 ? "off" : ""}`}
              type="button"
              onClick={() => void submitOtp(screen === "signup-code" ? "signup" : "login")}
            >
              {t("enter")}
            </button>
          </div>
        </div>
      </>
    )}

    {screen === "signup-done" && session && (
      <>
        <Header />
        <div className="page auth">
          <div className="kicker">{t("signup_done")}</div>
          <h1>{session.nick}</h1>
          <p className="sub">{t("your_id_name")}</p>
          <div className="gap" />
          <div className="field">
            <label>{t("recovery_codes")}</label>
            {(recoveryCodes.length ? recoveryCodes : recovery ? [recovery] : []).map((c, i) => (
              <div className="recovery-code" key={`${i}-${c}`}>
                {c}
              </div>
            ))}
          </div>
          <p className="hint">{t("save_recovery")}</p>
          <div className="btns">
            <button className="btn p" type="button" onClick={() => setScreen("today")}>
              {t("i_wrote_it")}
            </button>
          </div>
        </div>
      </>
    )}

    {screen === "login" && (
      <>
        <Header title={t("sign_in")} onBack={() => setScreen("welcome")} />
        <div className="page auth">
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
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <button className={`btn p ${busy ? "off" : ""}`} type="button" onClick={() => void submitLogin()}>
              {t("enter")}
            </button>
          </div>
          <div className="btns">
            <button className="link-quiet" type="button" onClick={() => setScreen("recovery")}>
              {t("forgot")}
            </button>
          </div>
          <div className="btns">
            <button className="link-quiet" type="button" onClick={() => { setErr(""); setCode(""); setOtpId(""); setScreen("rebind-2fa"); }}>
              {t("lost_telegram")}
            </button>
          </div>
        </div>
      </>
    )}

    {screen === "recovery" && (
      <>
        <Header title={t("recover")} onBack={() => setScreen("login")} />
        <div className="page auth">
          <RecoveryForm
            t={t}
            nick={nick}
            setNick={setNick}
            recovery={recovery}
            setRecovery={setRecovery}
            password={password}
            setPassword={setPassword}
            password2={password2}
            setPassword2={setPassword2}
            err={err}
            busy={busy}
            recoveryCount={meta?.recoveryCodes ?? 10}
            onDone={(s, key, newCodes) => {
              dataKeyRef.current = key;
              setSession(s);
              setAppearance(s.appearance);
              if (newCodes?.length) {
                setRecovery(newCodes[0] ?? "");
                setRecoveryCodes(newCodes);
                setScreen("recovery-done");
              } else {
                setScreen("today");
              }
            }}
            onError={fail}
          />
          <p className="hint">{t("no_support_reset")}</p>
        </div>
      </>
    )}

    {screen === "recovery-done" && session && (
      <>
        <Header />
        <div className="page auth">
          <div className="kicker">{t("signup_done")}</div>
          <h1>{session.nick}</h1>
          <div className="field">
            <label>{t("recovery_codes")}</label>
            {(recoveryCodes.length ? recoveryCodes : recovery ? [recovery] : []).map((c, i) => (
              <div className="recovery-code" key={`${i}-${c}`}>
                {c}
              </div>
            ))}
          </div>
          <p className="hint">{t("new_recovery_issued")}</p>
          <p className="hint">{t("save_recovery")}</p>
          <div className="btns">
            <button className="btn p" type="button" onClick={() => setScreen("today")}>
              {t("i_wrote_it")}
            </button>
          </div>
        </div>
      </>
    )}
    </>
  );
}
