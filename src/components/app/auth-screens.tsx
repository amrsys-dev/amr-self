import { toNickChars } from "@/lib/nick-translit.ts";
import { Header, TestBanner, LangPicker } from "./ui.tsx";
import { RecoveryForm } from "./recovery-form.tsx";
import { checkPassword, passwordChecks } from "@/lib/password-policy.ts";
import { homeScreen, type App } from "./use-id-app.ts";

/** Welcome, sign-up, login, recovery. */
export function AuthScreens({ app }: { app: App }) {
  const { lang, setLang, t, screen, setScreen, setAppearance, meta, session, setSession, err, setErr, busy, testOtp, deepLink, setKeyVersion, nick, setNick, nickStatus, setNickStatus, password, setPassword, password2, setPassword2, channel, setChannel, dest, setDest, setOtpId, code, setCode, recovery, setRecovery, recoveryCodes, setRecoveryCodes, showPassword, setShowPassword, showPassword2, setShowPassword2, dataKeyRef, fail, checkNick, submitSignup, submitOtp, submitLogin, startGuest, startGoogle } = app;
  return (
    <>
    {screen === "welcome" && (
      <>
        <Header tool={<LangPicker lang={lang} setLang={setLang} t={t} />} />
        <div className="page auth">
          {app.idMode ? (
            <>
              <div className="kicker">{t("kicker")}</div>
              <h1>{t("app")}</h1>
              <p className="sub">{t("id_sub")}</p>
            </>
          ) : (
            <>
              <div className="kicker">{t("kicker")}</div>
              <h1>{t("welcome_title")}</h1>
              <p className="sub">{t("welcome_sub")}</p>
            </>
          )}
          <div className="gap" />
          <div className="card hero" style={{ textAlign: "center", padding: "28px 20px" }}>
            <div className="tiny">{t("example_nick")}</div>
            <div className="nick" style={{ fontSize: 32, marginTop: 4 }}>
              name.amr
            </div>
          </div>
          {app.idMode ? (
            <div className="btns" style={{ marginTop: 24 }}>
              <button
                className="btn p"
                type="button"
                onClick={() => {
                  setNick("");
                  setNickStatus("");
                  setScreen("signup-nick");
                }}
              >
                {t("create_id")}
              </button>
              <button className="btn g" type="button" onClick={() => setScreen("login")}>
                {t("have_id")}
              </button>
            </div>
          ) : (
            <div className="btns" style={{ marginTop: 24 }}>
              {/* SELF: account lives in AMR ID (id.amrsys.net); sign-in and sign-up happen there. */}
              <a className="btn p" href="/api/auth/amrid">{t("self_login_id")}</a>
            </div>
          )}
          {app.idMode ? null : (
            <div className="btns" style={{ marginTop: 10 }}>
              <button className="btn g ghost" type="button" onClick={startGuest}>
                {t("start_without_account")}
              </button>
            </div>
          )}
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
              <NickInput value={nick} onChange={(v) => void checkNick(v)} />
            </div>
          </div>
          <NickStatusLine status={nickStatus} lang={lang} />
          <p className="hint">{t("nick_suffix_hint")}</p>
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
          {(() => {
            const c = passwordChecks(password, nick);
            const ok1 = c.len && c.mix && c.simple && c.nick;
            const match = password2.length > 0 && password === password2;
            const bad1 = password.length > 0 && !ok1;
            const bad2 = password2.length > 0 && !match && (password2.length >= password.length || !password.startsWith(password2));
            const row = (good: boolean, label: string) => (
              <li className={good ? "ok" : password ? "no" : ""}>
                <span aria-hidden="true">{good ? "✓" : password ? "✕" : "•"}</span>
                {label}
              </li>
            );
            return (
              <>
                <div className={`field ${bad1 ? "bad" : ok1 ? "good" : ""}`}>
                  <label>{t("password")} <em className="req">*</em></label>
                  <div className="box">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => { setErr(""); setPassword(e.target.value); }} autoComplete="new-password" aria-invalid={bad1} />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? t("hide_password") : t("show_password")}>{showPassword ? t("hide_password") : t("show_password")}</button>
                  </div>
                </div>
                <ul className="pwcheck" aria-live="polite">
                  {row(c.len, t("pw_len"))}
                  {row(c.mix, t("pw_mix"))}
                  {password && !c.simple ? row(false, t("pw_simple")) : null}
                  {password && !c.nick ? row(false, t("pw_nick")) : null}
                </ul>
                <div className={`field ${bad2 ? "bad" : match && ok1 ? "good" : ""}`}>
                  <label>{t("password_again")} <em className="req">*</em></label>
                  <div className="box">
                    <input type={showPassword2 ? "text" : "password"} value={password2} onChange={(e) => { setErr(""); setPassword2(e.target.value); }} autoComplete="new-password" aria-invalid={bad2} />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword2((v) => !v)} aria-label={showPassword2 ? t("hide_password") : t("show_password")}>{showPassword2 ? t("hide_password") : t("show_password")}</button>
                  </div>
                </div>
                {bad2 ? <div className="err">{t("mismatch")}</div> : match && ok1 ? <div className="okline">✓ {t("pw_match")}</div> : null}
                {err ? <div className="err">{err}</div> : null}
                <div className="btns">
                  <button
                    className={`btn p ${busy || !ok1 || !match ? "off" : ""}`}
                    disabled={busy}
                    type="button"
                    onClick={() => {
                      const policy = checkPassword(password, nick);
                      if (!policy.ok) {
                        setErr(t(policy.reason === "short" ? "password_short" : policy.reason === "same_as_nick" ? "pw_nick" : "password_weak"));
                        return;
                      }
                      if (password !== password2) {
                        setErr(t("mismatch"));
                        return;
                      }
                      setErr("");
                      void submitSignup();
                    }}
                  >
                    {t("next")}
                  </button>
                </div>
              </>
            );
          })()}
          {busy ? <p className="hint" role="status">{t("creating_keys")}</p> : null}
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
          <div className="card hero" style={{ textAlign: "center", marginTop: 16 }}>
            <div className="tiny">Твой личный QR</div>
            <div style={{ fontSize: 15, fontWeight: 700, margin: "6px 0 4px" }}>{session.nick}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Только твой. Другой человек получит свой QR со своим ником.</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>Отправь его. Сменишь номер — те, у кого есть визитка, не потеряют тебя.</div>
          </div>
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
            <button className="btn p" type="button" onClick={() => setScreen(homeScreen())}>
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
              <NickInput value={nick} onChange={setNick} />
            </div>
          </div>
          <div className="field">
            <label>{t("password")}</label>
            <div className="box">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? t("hide_password") : t("show_password")}>{showPassword ? t("hide_password") : t("show_password")}</button>
            </div>
          </div>
          {err ? <div className="err">{err}</div> : null}
          <div className="btns">
            <button className={`btn p ${busy ? "off" : ""}`} type="button" onClick={() => void submitLogin()}>
              {t("enter")}
            </button>
          </div>
          {meta?.googleLogin && !app.idMode ? (
            <div className="btns">
              <button className={`btn g ${busy ? "off" : ""}`} type="button" onClick={() => startGoogle("login")}>
                {t("google_login")}
              </button>
            </div>
          ) : null}
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
              setKeyVersion((v) => v + 1);
              setSession(s);
              setAppearance(s.appearance);
              if (newCodes?.length) {
                setRecovery(newCodes[0] ?? "");
                setRecoveryCodes(newCodes);
                setScreen("recovery-done");
              } else {
                setScreen(homeScreen());
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
            <button className="btn p" type="button" onClick={() => setScreen(homeScreen())}>
              {t("i_wrote_it")}
            </button>
          </div>
        </div>
      </>
    )}

    </>
  );
}

/** Nick field: the user types only the name, ".amr" is always shown and added. */
const NICK_MSG: Record<string, Record<string, string>> = {
  ru: { checking: "Проверяю…", free: "свободен", taken: "занят — попробуйте добавить фамилию, город или цифры", format: "3–32 символа: латинские буквы, цифры, точка, дефис", reserved: "это служебное слово AMR — выберите другой ник", offline: "Нет связи, проверю позже" },
  en: { checking: "Checking…", free: "available", taken: "taken — try adding a surname, city or numbers", format: "3–32 characters: Latin letters, digits, dot, hyphen", reserved: "this is a reserved AMR word — choose another nick", offline: "No connection, will check later" },
  ar: { checking: "جارٍ التحقق…", free: "متاح", taken: "محجوز — أضف اسم العائلة أو المدينة أو أرقامًا", format: "من 3 إلى 32 حرفًا: أحرف لاتينية وأرقام ونقطة وشرطة", reserved: "هذه كلمة محجوزة لـ AMR — اختر اسمًا آخر", offline: "لا يوجد اتصال" },
  uz: { checking: "Tekshirilmoqda…", free: "bo‘sh", taken: "band — familiya, shahar yoki raqam qo‘shing", format: "3–32 belgi: lotin harflari, raqamlar, nuqta, chiziqcha", reserved: "bu AMR xizmat so‘zi — boshqa nik tanlang", offline: "Aloqa yo‘q" },
  tj: { checking: "Санҷиш…", free: "озод", taken: "банд — насаб, шаҳр ё рақам илова кунед", format: "3–32 аломат: ҳарфҳои лотинӣ, рақам, нуқта, тире", reserved: "ин калимаи хидматии AMR — ники дигар интихоб кунед", offline: "Пайваст нест" },
};

/** One status line under every nick field: checking / free / taken / format / reserved. */
export function NickStatusLine({ status, lang }: { status: string; lang: string }) {
  if (!status) return null;
  const m = NICK_MSG[lang] ?? NICK_MSG.en;
  const cls = status === "free" ? "ok" : status === "checking" || status === "offline" ? "wait" : "bad";
  return (
    <div className={`nick-status ${cls}`} role="status" aria-live="polite">
      <i className="dot" /> {m[status] ?? m.taken}
    </div>
  );
}

export function NickInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const handle = value.replace(/^@/, "").replace(/(?:\.amr|@amr)$/i, "");
  return (
    <span className="nick-input">
      <input
        value={handle}
        placeholder="name"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="username"
        spellCheck={false}
        onChange={(e) => {
          const clean = toNickChars(e.target.value.replace(/^\s*@/, "").replace(/(?:\.amr|@amr)$/i, ""));
          onChange(clean ? `${clean}.amr` : "");
        }}
      />
      <span className="nick-suffix" aria-hidden="true">.amr</span>
    </span>
  );
}
