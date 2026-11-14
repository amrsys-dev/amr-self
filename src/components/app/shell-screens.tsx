import type { ReactNode } from "react";
import { UI_THEMES, type UiTheme } from "./use-id-app.ts";
import type { MsgKey } from "@/lib/i18n.ts";
import { Header, LangPicker } from "./ui.tsx";
import { SelfWorkspace } from "../self-workspace.tsx";
import { accountIdOf, GLYPH } from "./types.ts";
import type { App } from "./use-id-app.ts";

const NAV_PATHS: Record<"today" | "finance" | "work" | "more" | "profile", ReactNode> = {
  today: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></>,
  finance: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10.5h18" /><circle cx="16.5" cy="15" r="1.3" /></>,
  work: <><rect x="3" y="7.5" width="18" height="12.5" rx="2.5" /><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2" /><path d="M3 13h18" /></>,
  more: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" /></>,
  profile: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
};

function NavIcon({ name }: { name: keyof typeof NAV_PATHS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_PATHS[name]}
    </svg>
  );
}

/** One compact control instead of big tiles: graphite, light (wave header) or Saudi (green and matte gold). */
function ThemeSelect({ theme, chooseTheme, t }: { theme: UiTheme; chooseTheme: (v: UiTheme) => void; t: (k: MsgKey) => string }) {
  return (
    <div className="group">
      <label className="lab" htmlFor="ui-theme">{t("ui_theme")}</label>
      <div className="select-wrap">
        <select id="ui-theme" value={theme} onChange={(e) => chooseTheme(e.target.value as UiTheme)}>
          {UI_THEMES.map((k) => (
            <option key={k} value={k}>{t(`theme_${k}` as MsgKey)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

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
  const { lang, setLang, t, screen, setScreen, meta, session, setErr, setTestOtp, keyVersion, setKeyVersion, setOtpId, setCode, setReauthPassword, setNewNick, setNewNickStatus, setPendingContactId, dataKeyRef, setSheet, logout, toggleContact, inShell, theme, chooseTheme, guest, guestStore, backupMsg, exportBackup, importBackup, setNick, setNickStatus } = app;
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
              onNavigate={(next) => setScreen(next)}
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
              onNavigate={(next) => setScreen(next)}
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
              <ThemeSelect theme={theme} chooseTheme={chooseTheme} t={t} />
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
                <button className="btn g" type="button" onClick={() => void logout()}>
                  {t("sign_out")}
                </button>
              </div>
              <div className="btns">
                <button
                  className="btn danger"
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
              {!session ? <ThemeSelect theme={theme} chooseTheme={chooseTheme} t={t} /> : null}
              {!session ? <LangPicker lang={lang} setLang={setLang} t={t} /> : null}
            </div>
          )}
        </div>
        <nav className="nav" aria-label={t("sections")}>
          {([
            ["today", t("today")],
            ["finance", t("finance")],
            ["work", t("work")],
            ["more", t("more")],
            ["profile", t("profile")],
          ] as const).map(([k, label]) => (
            <button key={k} type="button" className={screen === k ? "on" : ""} aria-current={screen === k ? "page" : undefined} onClick={() => setScreen(k)}>
              <NavIcon name={k} />
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
