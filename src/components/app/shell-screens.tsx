import React, { useState, useEffect, type ReactNode } from "react";
import { UI_THEMES, type UiMode, type UiTheme } from "./use-id-app.ts";
import type { MsgKey } from "@/lib/i18n.ts";
import { Header, LANG_OPTIONS } from "./ui.tsx";
import { InstallButton } from "./install-button.tsx";

function NotificationsRow({ t }: { t: (k: string) => string }) {
  const [status, setStatus] = useState<"default" | "granted" | "denied" | "unsupported">("default");
  useEffect(() => {
    if (typeof Notification === "undefined") setStatus("unsupported");
    else setStatus(Notification.permission as "default" | "granted" | "denied");
  }, []);
  const enable = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setStatus(perm as "default" | "granted" | "denied");
    if (perm === "granted" && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      // Subscription is prepared; server sending comes later.
      try { await reg.pushManager.getSubscription(); } catch { /* ignore */ }
    }
  };
  if (status === "unsupported") return null;
  return (
    <div className="set-row">
      <span className="set-label">{t("notifications")}</span>
      {status === "granted" ? (
        <span className="tiny" style={{ color: "var(--ok)" }}>{t("notifications_on")}</span>
      ) : status === "denied" ? (
        <span className="tiny">{t("notifications_blocked")}</span>
      ) : (
        <button className="btn sm" type="button" onClick={() => void enable()}>{t("notifications_enable")}</button>
      )}
    </div>
  );
}

import type { Lang } from "@/lib/i18n.ts";
import { SelfWorkspace } from "../self-workspace.tsx";
import { accountIdOf } from "./types.ts";
import { ServiceIcon } from "../contact-icons.tsx";
import { CardHero } from "../qr-card.tsx";
import { CurrencySign, useCurrency } from "../self/currency.tsx";
import { isCurrency } from "@/lib/finance/currency.ts";
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

/** Settings row with a native picker laid over it: label on the left, current value on the right. */
function PickRow({ label, value, children, onPick, current }: { label: string; value: ReactNode; children?: ReactNode; onPick: (v: string) => void; current: string }) {
  return (
    <label className="set-row">
      <span className="set-label">{label}</span>
      <span className="set-value">{value}</span>
      <span className="set-chev" aria-hidden="true">⌄</span>
      <select className="set-pick" aria-label={label} value={current} onChange={(e) => onPick(e.target.value)}>{children}</select>
    </label>
  );
}

const THEME_SWATCH: Record<UiTheme, string> = {
  emerald: "linear-gradient(135deg,#0F2B21 0 50%,#2BD49E 50% 100%)",
  graphite: "linear-gradient(135deg,#18202A 0 50%,#5AA9FF 50% 100%)",
  bronze: "linear-gradient(135deg,#241A13 0 50%,#D9A26A 50% 100%)",
};

/** Light / Dark / Auto as a segmented switch, then theme swatches. */
function AppearanceRows({ theme, chooseTheme, mode, chooseMode, t }: { theme: UiTheme; chooseTheme: (v: UiTheme) => void; mode: UiMode; chooseMode: (v: UiMode) => void; t: (k: MsgKey) => string }) {
  const MODES: [UiMode, MsgKey][] = [["light", "mode_light"], ["dark", "mode_dark"], ["system", "mode_auto"]];
  return (
    <>
      <div className="set-seg">
        <span className="set-label">{t("ui_mode")}</span>
        <div className="seg" role="radiogroup" aria-label={t("ui_mode")}>
          {MODES.map(([m, k]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => chooseMode(m)}>{t(k)}</button>
          ))}
        </div>
      </div>
      <div className="set-seg">
        <span className="set-label">{t("ui_theme")}</span>
      </div>
      <div className="swatches" role="radiogroup" aria-label={t("ui_theme")}>
        {UI_THEMES.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={theme === k} className={"swatch" + (theme === k ? " on" : "")} onClick={() => chooseTheme(k)}>
            <i style={{ background: THEME_SWATCH[k] }} />
            {t(`fam_${k}` as MsgKey)}
          </button>
        ))}
      </div>
    </>
  );
}

function LangRow({ lang, setLang, t }: { lang: Lang; setLang: (l: Lang) => void; t: (k: MsgKey) => string }) {
  const cur = LANG_OPTIONS.find((o) => o.code === lang) ?? LANG_OPTIONS[0]!;
  return (
    <PickRow label={t("lang")} value={<><span className="set-flag">{cur.flag}</span>{cur.code.toUpperCase()}</>} current={lang} onPick={(v) => setLang(v as Lang)}>
      {LANG_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.flag} {o.name}</option>)}
    </PickRow>
  );
}

const CURRENCY_NAMES = { SAR: "Saudi riyal", USD: "US dollar", RUB: "Российский рубль", UZS: "Oʻzbek soʻmi", TJS: "Сомонӣ" } as const;

function CurrencyRow({ t }: { t: (k: MsgKey) => string }) {
  const { cur, setCur, currencies } = useCurrency();
  return (
    <PickRow label={t("currency")} value={<><CurrencySign cur={cur} /> {cur}</>} current={cur} onPick={(v) => { if (isCurrency(v)) setCur(v); }}>
      {currencies.map((c) => <option key={c} value={c}>{c} · {CURRENCY_NAMES[c]}</option>)}
    </PickRow>
  );
}

function LinkRow({ label, onClick, tone, disabled }: { label: string; onClick: () => void; tone?: "accent" | "danger"; disabled?: boolean }) {
  return (
    <button type="button" className={"set-row" + (tone ? " " + tone : "")} onClick={onClick} disabled={disabled}>
      <span className="set-label">{label}</span>
      {!tone && <span className="set-chev" aria-hidden="true">›</span>}
    </button>
  );
}

/** Main tabs (Today, Finance, Work, More, Profile) and module placeholders. */
export function ShellScreens({ app }: { app: App }) {
  const { lang, setLang, t, screen, setScreen, meta, session, setErr, setTestOtp, keyVersion, setKeyVersion, setOtpId, setCode, setReauthPassword, setNewNick, setNewNickStatus, setPendingContactId, dataKeyRef, setSheet, logout, toggleContact, inShell, theme, chooseTheme, uiMode, chooseMode, guest, guestStore, backupMsg, exportBackup, importBackup, setNick, setNickStatus, openGoogleLink, googleSignIn, cardUrl, publicContacts, origin, shareCard, shareCardImage, saveVcard, uploadPhoto, removePhoto } = app;
  return (
    <>
    {inShell && (
      <>
        {/* Tabs show only the product mark; each screen carries its own large title. */}
        <Header />
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
              lockHint={googleSignIn ? t("google_unlock_hint") : undefined}
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
          {screen === "profile" && (
            <header className="self-large"><h1>{t("profile")}</h1></header>
          )}
          {screen === "profile" && session && (
            <>
              <div className={`skin-page skin-${session.theme}`} style={{ margin: "0 -20px 16px", padding: "8px 0" }}>
                <CardHero
                  nick={session.nick}
                  url={cardUrl}
                  theme={session.theme}
                  contacts={publicContacts}
                  lang={lang}
                  domain={origin.replace(/^https?:\/\//, "")}
                  onShareLink={shareCard}
                  onShareImage={() => void shareCardImage()}
                  onVcard={saveVcard}
                  photo={session.photo}
                  onPickPhoto={(f) => void uploadPhoto(f)}
                  onRemovePhoto={() => void removePhoto()}
                />
              </div>
              <div className="group">
                <div className="lab">{t("show_hide")}</div>
                <div className="card pad0 set-list">
                  {session.contacts.map((c) => (
                    <div className="set-row" key={c.id}>
                      <ServiceIcon kind={c.kind} size={32} />
                      <span className="set-label set-contact">{c.value}</span>
                      <button className={`toggle ${c.visible ? "on" : ""}`} type="button" onClick={() => void toggleContact(c)} aria-label={t("show_hide")} aria-pressed={c.visible}>
                        <i />
                      </button>
                    </div>
                  ))}
                  <LinkRow label={t("add_contact")} tone="accent" onClick={() => setSheet("kind")} />
                </div>
              </div>
              <div className="card pad0 set-list">
                <AppearanceRows theme={theme} chooseTheme={chooseTheme} mode={uiMode} chooseMode={chooseMode} t={t} />
                <LangRow lang={lang} setLang={setLang} t={t} />
                <CurrencyRow t={t} />
                <div className="set-row pwa-set"><InstallButton t={t} className="set-label" /></div>
                <NotificationsRow t={t} />
                <LinkRow label={t("card_theme")} onClick={() => setScreen("card-themes")} />
                <LinkRow
                  label={session.nickChanged ? t("nick_change_used") : t("change_nick")}
                  disabled={session.nickChanged}
                  onClick={() => {
                    setNewNick("");
                    setNewNickStatus("");
                    setReauthPassword("");
                    setErr("");
                    setScreen("nick-change");
                  }}
                />
                {session.contacts.some((c) => c.verified && c.kind === "telegram") ? (
                  <LinkRow
                    label={t("change_channel")}
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
                  />
                ) : null}
              </div>
            </>
          )}
          {screen === "profile" && !session && (
            <>
              <div className="card hero" style={{ textAlign: "center" }}>
                <h2>{t("guest_title")}</h2>
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
              <div className="card pad0 set-list">
                <AppearanceRows theme={theme} chooseTheme={chooseTheme} mode={uiMode} chooseMode={chooseMode} t={t} />
                <LangRow lang={lang} setLang={setLang} t={t} />
                <CurrencyRow t={t} />
                <div className="set-row pwa-set"><InstallButton t={t} className="set-label" /></div>
              </div>
            </>
          )}
          {screen === "profile" && (
            <div className="group">
              <div className="lab">{t("backup")}</div>
              <div className="card pad0 set-list">
                <LinkRow label={t("backup_export")} onClick={() => void exportBackup()} />
                <label className="set-row">
                  <span className="set-label">{t("backup_import")}</span>
                  <span className="set-chev" aria-hidden="true">›</span>
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
            </div>
          )}
          {screen === "profile" && session && (
            <div className="card pad0 set-list">
              {meta?.googleLogin ? (
                <LinkRow label={session.googleLinked ? t("google_unlink") : t("google_link")} onClick={() => openGoogleLink(session.googleLinked ? "unlink" : "link")} />
              ) : null}
              <LinkRow label={t("sign_out")} tone="accent" onClick={() => void logout()} />
              <LinkRow
                label={t("delete_my_data")}
                tone="danger"
                onClick={() => {
                  setReauthPassword("");
                  setCode("");
                  setOtpId("");
                  setTestOtp(undefined);
                  setErr("");
                  setScreen("account-delete");
                }}
              />
            </div>
          )}
          {screen === "profile" && session && meta?.testMode ? <p className="tiny">{t("test_banner")}</p> : null}
        </div>
        <nav className="nav" aria-label={t("sections")}>
          {([
            ["today", t("nav_home")],
            ["finance", t("finance")],
            ["work", t("nav_planner")],
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


    </>
  );
}
