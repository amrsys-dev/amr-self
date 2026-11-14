import type { MsgKey } from "@/lib/i18n.ts";
import { Header, LangPicker } from "./ui.tsx";
import { SelfWorkspace } from "../self-workspace.tsx";
import { accountIdOf, GLYPH } from "./types.ts";
import type { App } from "./use-id-app.ts";

function Soon({ title, t, onBack }: { title: string; t: (k: MsgKey) => string; onBack: () => void }) {
  return (
    <>
      <Header title={title} onBack={onBack} />
      <div className="page">
        <div className="soon">
          <h2>{t("soon")}</h2>
          <p>{t("soon_sub")}</p>
        </div>
      </div>
    </>
  );
}

/** Main tabs (Today, Finance, Work, More, Profile) and module placeholders. */
export function ShellScreens({ app }: { app: App }) {
  const { lang, setLang, t, screen, setScreen, appearance, setAppearance, meta, session, setErr, setTestOtp, keyVersion, setKeyVersion, setOtpId, setCode, setReauthPassword, setNewNick, setNewNickStatus, setPendingContactId, dataKeyRef, setSheet, logout, saveProfile, toggleContact, inShell, guest, guestStore, backupMsg, exportBackup, importBackup, setNick, setNickStatus } = app;
  return (
    <>
    {inShell && (
      <>
        <Header title={screen === "today" ? t("today") : screen === "finance" ? t("finance") : screen === "work" ? t("work") : screen === "more" ? t("more") : t("profile")} />
        <div className="page withnav">
          {(screen === "today" || screen === "finance" || screen === "work" || screen === "more") && !session && guest && (
            <SelfWorkspace
              section={screen}
              accountId="guest"
              dataKey={null}
              keyVersion={keyVersion}
              lang={lang}
              onUnlock={() => undefined}
              onOpenCard={() => setScreen("profile")}
              guestStore={guestStore}
            />
          )}
          {(screen === "today" || screen === "finance" || screen === "work" || screen === "more") && session && (
            <SelfWorkspace
              section={screen}
              accountId={accountIdOf(session)}
              wrapPassword={session.wrapPassword}
              passwordKdf={session.kdf?.password}
              dataKey={dataKeyRef.current}
              keyVersion={keyVersion}
              lang={lang}
              onUnlock={(key) => {
                dataKeyRef.current = key;
                setKeyVersion((v) => v + 1);
              }}
              onOpenCard={() => setScreen("card")}
            />
          )}
          {screen === "profile" && session && (
            <>
              <div className="card hero" style={{ textAlign: "center" }}>
                <div className="nick" style={{ fontSize: 28 }}>
                  {session.nick}
                </div>
              </div>
              <div className="group">
                <div className="lab">{t("show_hide")}</div>
                <div className="card pad0">
                  {session.contacts.map((c) => (
                    <div className="row crow" key={c.id}>
                      <span className="glyph ico">{GLYPH[c.kind]}</span>
                      <div className="txt">
                        <b>{c.kind === "whatsapp" ? t("listed_by_owner") : c.value}</b>
                              </div>
                      <button className={`toggle ${c.visible ? "on" : ""}`} type="button" onClick={() => void toggleContact(c)} aria-label={t("show_hide")}>
                        <i />
                      </button>
                    </div>
                  ))}
                  <button className="row" type="button" onClick={() => setSheet("kind")}>
                    <div className="txt">
                      <b>{t("add_contact")}</b>
                    </div>
                  </button>
                </div>
              </div>
              <div className="group">
                <div className="lab">{t("appearance")}</div>
                <div className="themes">
                  <button className={`sw ${appearance === "dark" ? "on" : ""}`} type="button" onClick={() => { setAppearance("dark"); void saveProfile({ appearance: "dark" }); }}>
                    <div className="prev dark" />
                    <span>{t("graphite")}</span>
                  </button>
                  <button className={`sw ${appearance === "light" ? "on" : ""}`} type="button" onClick={() => { setAppearance("light"); void saveProfile({ appearance: "light" }); }}>
                    <div className="prev light" />
                    <span>{t("light")}</span>
                  </button>
                </div>
              </div>
              <div className="btns">
                <button className="btn g" type="button" onClick={() => setScreen("card-themes")}>
                  {t("card_theme")}
                </button>
              </div>
              <LangPicker lang={lang} setLang={setLang} t={t} />
              <div className="btns">
                <button
                  className={`btn g ${session.nickChanged ? "off" : ""}`}
                  type="button"
                  onClick={() => {
                    if (session.nickChanged) return;
                    setNewNick("");
                    setNewNickStatus("");
                    setReauthPassword("");
                    setErr("");
                    setScreen("nick-change");
                  }}
                >
                  {session.nickChanged ? t("nick_change_used") : t("change_nick")}
                </button>
              </div>
              {session.contacts.some((c) => c.verified && c.kind === "telegram") ? (
                <div className="btns">
                  <button
                    className="btn g"
                    type="button"
                    onClick={() => {
                      const next = session.contacts.find((c) => c.verified && c.kind === "telegram");
                      setPendingContactId(next?.id ?? "");
                      setReauthPassword("");
                      setCode("");
                      setOtpId("");
                      setTestOtp(undefined);
                      setErr("");
                      setScreen("sec-2fa-change");
                    }}
                  >
                    {t("change_channel")}
                  </button>
                </div>
              ) : null}
              <div className="btns">
                <button className="btn t" type="button" onClick={() => void logout()}>
                  {t("sign_out")}
                </button>
              </div>
              <div className="btns">
                <button
                  className="btn t"
                  type="button"
                  onClick={() => {
                    setReauthPassword("");
                    setCode("");
                    setOtpId("");
                    setTestOtp(undefined);
                    setErr("");
                    setScreen("account-delete");
                  }}
                >
                  {t("delete_my_data")}
                </button>
              </div>
              {meta?.testMode ? (
                <p className="tiny">
                  {t("test_banner")}
                  {meta.storeKind === "memory" ? " · " : ""}
                </p>
              ) : null}
            </>
          )}
          {screen === "profile" && !session && (
            <div className="card hero" style={{ textAlign: "center" }}>
              <h2>{t("guest_title")}</h2>
              <p className="sub">{t("guest_sub")}</p>
              <div className="btns">
                <button className="btn p" type="button" onClick={() => { setNick(""); setNickStatus(""); setScreen("signup-nick"); }}>
                  {t("create_id")}
                </button>
              </div>
              <div className="btns">
                <button className="btn g" type="button" onClick={() => setScreen("login")}>
                  {t("have_id")}
                </button>
              </div>
            </div>
          )}
          {screen === "profile" && (
            <div className="group">
              <div className="lab">{t("backup")}</div>
              <p className="hint">{t("backup_hint_file")}</p>
              <div className="btns">
                <button className="btn g" type="button" onClick={() => void exportBackup()}>
                  {t("backup_export")}
                </button>
              </div>
              <div className="btns">
                <label className="btn g">
                  {t("backup_import")}
                  <input
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void importBackup(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {backupMsg ? <p className="hint" role="status">{t(backupMsg)}</p> : null}
              {!session ? <LangPicker lang={lang} setLang={setLang} t={t} /> : null}
            </div>
          )}
        </div>
        <nav className="nav">
          {([
            ["today", t("today")],
            ["finance", t("finance")],
            ["work", t("work")],
            ["more", t("more")],
            ["profile", t("profile")],
          ] as const).map(([k, label]) => (
            <button key={k} type="button" className={screen === k ? "on" : ""} onClick={() => setScreen(k)}>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </>
    )}

    {(session || guest) && screen === "visa" && <Soon title={t("visa")} t={t} onBack={() => setScreen("more")} />}
    {(session || guest) && screen === "diary" && <Soon title={t("diary")} t={t} onBack={() => setScreen("more")} />}
    {(session || guest) && screen === "sport" && <Soon title={t("sport")} t={t} onBack={() => setScreen("more")} />}
    {(session || guest) && screen === "plans" && <Soon title={t("plans")} t={t} onBack={() => setScreen("more")} />}

    </>
  );
}
