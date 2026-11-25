import React, { useState, useEffect, type ReactNode } from "react";
import { UI_THEMES, type UiMode, type UiTheme } from "./use-id-app.ts";
import type { MsgKey } from "@/lib/i18n.ts";
import { Header, LANG_OPTIONS } from "./ui.tsx";
import { useBackLayer } from "@/lib/back-stack.ts";
import { InstallButton } from "./install-button.tsx";
import { ThemeLangBar } from "./theme-lang.tsx";
import { AdminPlans } from "./admin-plans.tsx";

const NOTIF: Record<string, [string, string, string, string]> = {
  ru: ["Уведомления", "Включены", "Запрещены в браузере", "Включить"],
  en: ["Notifications", "On", "Blocked in browser", "Turn on"],
  ar: ["الإشعارات", "مفعّلة", "محظورة في المتصفح", "تفعيل"],
  uz: ["Bildirishnomalar", "Yoqilgan", "Brauzerda bloklangan", "Yoqish"],
  tj: ["Огоҳиномаҳо", "Фаъол", "Дар браузер манъ шудааст", "Фаъол кардан"],
};

const NAME_COPY: Record<string, [string, string, string]> = {
  ru: ["Имя на визитке", "Например: Мурад Алиев", "На любом языке. Видно всем, кто открывает визитку."],
  en: ["Name on the card", "e.g. John Smith", "Any language. Everyone who opens your card sees it."],
  ar: ["الاسم على البطاقة", "مثال: عبد الرحمن بن محمد", "بأي لغة. يراه كل من يفتح بطاقتك."],
  uz: ["Vizitkadagi ism", "Masalan: Aziz Karimov", "Istalgan tilda. Vizitkani ochgan har kim ko‘radi."],
  tj: ["Ном дар визитка", "Масалан: Ҷамшед Қодиров", "Бо ҳар забон. Ҳар кӣ визиткаро кушояд, мебинад."],
};

/** Name on the card in any language; saved when the field loses focus or Enter is pressed. */
function DisplayNameField({ value, lang, onSave }: { value: string; lang: string; onSave: (v: string) => void }) {
  const [label, placeholder, hint] = NAME_COPY[lang] ?? NAME_COPY.en;
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const next = v.replace(/\s+/g, " ").trim().slice(0, 60);
    if (next !== value) onSave(next);
  };
  return (
    <div className="group">
      <div className="lab">{label}</div>
      <div className="field">
        <div className="box">
          <input value={v} dir="auto" maxLength={60} placeholder={placeholder} aria-label={label} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </div>
      </div>
      <p className="hint">{hint}</p>
    </div>
  );
}

const EDIT_COPY: Record<string, [string, string, string, string, string]> = {
  ru: ["Изменить", "Сохранить", "Удалить контакт", "Удалить этот контакт?", "Этот контакт подтверждён для входа - его можно только удалить и добавить заново."],
  en: ["Edit", "Save", "Delete contact", "Delete this contact?", "This contact is verified for sign-in - you can only delete it and add it again."],
  ar: ["تعديل", "حفظ", "حذف جهة الاتصال", "حذف جهة الاتصال هذه؟", "هذه الجهة مؤكدة لتسجيل الدخول - يمكن حذفها وإضافتها من جديد فقط."],
  uz: ["Tahrirlash", "Saqlash", "Kontaktni o‘chirish", "Bu kontakt o‘chirilsinmi?", "Bu kontakt kirish uchun tasdiqlangan - faqat o‘chirib, qayta qo‘shish mumkin."],
  tj: ["Таҳрир", "Нигоҳ доштан", "Нест кардани контакт", "Ин контакт нест карда шавад?", "Ин контакт барои воридшавӣ тасдиқ шудааст - танҳо нест кардан ва аз нав илова кардан мумкин."],
};

/** One contact: change the value or delete it, in a bottom sheet (Back closes it). */
function ContactEditSheet({ contact, lang, name, onClose, onSave, onDelete }: { contact: Contact; lang: string; name: string; onClose: () => void; onSave: (v: string) => void; onDelete: () => void }) {
  const [label, save, del, confirmQ, verifiedNote] = EDIT_COPY[lang] ?? EDIT_COPY.en;
  const [v, setV] = useState(contact.value);
  const [confirm, setConfirm] = useState(false);
  useBackLayer(true, onClose);
  return (
    <>
      <div className="dim fixed-dim" onClick={onClose} />
      <div className="sheet idshare-sheet contact-edit" role="dialog" aria-label={label}>
        <div className="handle" />
        <h2 className="contact-edit-title"><ServiceIcon kind={contact.kind} size={34} /> {name}</h2>
        {contact.verified ? (
          <p className="hint">{verifiedNote}</p>
        ) : (
          <>
            <div className="field">
              <div className="box">
                <input value={v} dir="auto" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label={name} onChange={(e) => setV(e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn p" disabled={!v.trim() || v.trim() === contact.value} onClick={() => onSave(v.trim())}>{save}</button>
          </>
        )}
        {confirm ? (
          <button type="button" className="danger-solid" onClick={onDelete}>{confirmQ}</button>
        ) : (
          <button type="button" className="danger-ghost" onClick={() => setConfirm(true)}>{del}</button>
        )}
      </div>
    </>
  );
}

function NotificationsRow({ lang }: { lang: string }) {
  const [label, on, blocked, enableLbl] = NOTIF[lang] ?? NOTIF.en;
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
      <span className="set-label">{label}</span>
      {status === "granted" ? (
        <span className="tiny" style={{ color: "var(--ok)" }}>{on}</span>
      ) : status === "denied" ? (
        <span className="tiny">{blocked}</span>
      ) : (
        <button className="btn sm" type="button" onClick={() => void enable()}>{enableLbl}</button>
      )}
    </div>
  );
}

import type { Lang } from "@/lib/i18n.ts";
import { SelfWorkspace } from "../self-workspace.tsx";
import { accountIdOf } from "./types.ts";
import { ServiceIcon, serviceName } from "../contact-icons.tsx";
import type { Contact } from "@/lib/card/visibility.ts";
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
  const { lang, setLang, langAuto, t, screen, setScreen, meta, session, setErr, setTestOtp, keyVersion, setKeyVersion, setOtpId, setCode, setReauthPassword, setNewNick, setNewNickStatus, setPendingContactId, dataKeyRef, setSheet, logout, toggleContact, removeContact, inShell, theme, chooseTheme, uiMode, chooseMode, guest, guestStore, backupMsg, exportBackup, importBackup, setNick, setNickStatus, openGoogleLink, googleSignIn, startGoogle, cardUrl, publicContacts, origin, shareCard, shareCardImage, saveVcard, uploadPhoto, removePhoto, saveProfile } = app;
  // Back from any tab other than Home returns to Home (the usual app pattern).
  const idMode = app.idMode;
  const onTab = !idMode && inShell && (screen === "finance" || screen === "work" || screen === "more" || screen === "profile");
  useBackLayer(onTab, () => setScreen("today"));
  const [editing, setEditing] = useState<Contact | null>(null);
  return (
    <>
    {editing && session ? (
      <ContactEditSheet
        contact={editing}
        lang={lang}
        name={serviceName(editing.kind, t)}
        onClose={() => setEditing(null)}
        onSave={(value) => {
          void saveProfile({ contacts: session.contacts.map((x) => (x.id === editing.id ? { ...x, value } : x)) });
          setEditing(null);
        }}
        onDelete={() => {
          void removeContact(editing);
          setEditing(null);
        }}
      />
    ) : null}
    {inShell && (
      <>
        {/* Tabs show only the product mark; each screen carries its own large title. */}
        <Header />
        <div className={idMode ? "page" : "page withnav"}>
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
              <div style={{ margin: "0 0 16px" }}>
                <CardHero
                  nick={session.nick}
                  name={session.displayName}
                  url={cardUrl}
                  theme={session.theme}
                  contacts={publicContacts}
                  lang={lang}
                  domain={origin.replace(/^https?:\/\//, "")}
                  onShareLink={shareCard}
                  onShareImage={() => void shareCardImage()}
                  onVcard={saveVcard}
                  photo={session.photo}
            avatar={session.avatar}
                  onPickPhoto={(f, slot) => uploadPhoto(f, slot)}
                  onRemovePhoto={(slot) => removePhoto(slot)}
                  coverY={session.coverY}
                  onMoveCover={(y) => void saveProfile({ coverY: y })}
                  onPickBackground={() => setScreen("card-themes")}
                />
              </div>
              <DisplayNameField value={session.displayName ?? ""} lang={lang} onSave={(v) => void saveProfile({ displayName: v })} />
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
                      <button type="button" className="set-pen" aria-label={EDIT_COPY[lang]?.[0] ?? EDIT_COPY.en[0]} onClick={() => setEditing(c)}>
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M13 7l4 4" stroke="currentColor" strokeWidth="1.8" /></svg>
                      </button>
                    </div>
                  ))}
                  <LinkRow label={t("add_contact")} tone="accent" onClick={() => setSheet("kind")} />
                </div>
              </div>
              <div className="card pad0 set-list">
                <LinkRow label={t("contacts_title")} onClick={() => setScreen("contacts")} />
                <LinkRow label={t("subs_title")} onClick={() => setScreen("subs")} />
              </div>
              <div className="card pad0 set-list">
                <LinkRow label={t("card_bg")} onClick={() => setScreen("card-themes")} />
                <div className="set-row">
                  <span className="set-label">{t("img_phone")}</span>
                  <button className={`toggle ${session.imagePhone !== false ? "on" : ""}`} type="button" role="switch" aria-checked={session.imagePhone !== false} aria-label={t("img_phone")} onClick={() => void saveProfile({ imagePhone: session.imagePhone === false })}>
                    <i />
                  </button>
                </div>
                <div className="set-row tlrow"><ThemeLangBar mode={uiMode} chooseMode={chooseMode} lang={lang} setLang={setLang} langAuto={langAuto} t={t} /></div>
                {idMode ? null : <CurrencyRow t={t} />}
{session.nickChanged ? null : (
                <LinkRow
                  label={t("change_nick")}
                  onClick={() => {
                    setNewNick("");
                    setNewNickStatus("");
                    setReauthPassword("");
                    setErr("");
                    setScreen("nick-change");
                  }}
                />
                )}
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
          {screen === "profile" && session && idMode && (
            <div className="group">
              <div className="lab">{t("id_apps")}</div>
              <div className="card pad0 set-list">
                {([["SELF", "https://self.amrsys.net/", "self"], ["AMR Bazar", "https://bazar.amrsys.net/", "bazar"], ["AMR Safar", "https://safar.amrsys.net/", "safar"], ["Hostel", "https://hostel.amrsys.net/", "hostel"]] as const).map(([name, href, ic]) => (
                  <a key={ic} className="set-row" href={href}>
                    <img className="set-appic" src={`/apps/${ic}.webp`} alt="" width={32} height={32} />
                    <span className="set-label">{name}</span>
                    <span className="set-chev" aria-hidden="true">›</span>
                  </a>
                ))}
              </div>
              <p className="hint">{t("id_apps_hint")}</p>
            </div>
          )}
          {screen === "profile" && session && idMode && <AdminPlans />}
          {screen === "profile" && !session && (
            <>
              <div className="card hero" style={{ textAlign: "center" }}>
                <h2>{t("guest_title")}</h2>
                <div className="btns">
                  <a className="btn p" href="/api/auth/amrid">{t("self_login_id")}</a>
                </div>
                {meta?.googleLogin ? (
                  <div className="btns">
                    <button className="btn g" type="button" onClick={() => startGoogle("login")}>
                      {t("google_login")}
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="card pad0 set-list">
                <div className="set-row tlrow"><ThemeLangBar mode={uiMode} chooseMode={chooseMode} lang={lang} setLang={setLang} langAuto={langAuto} t={t} /></div>
                <CurrencyRow t={t} />
                <div className="set-row pwa-set"><InstallButton t={t} className="set-label" /></div>
              </div>
            </>
          )}
          {screen === "profile" && !idMode && (
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
              {backupMsg ? <p className="hint" role="status">{t(backupMsg)}</p> : <p className="hint">{t("backup_hint_file")}</p>}
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
        {idMode ? null : <nav className="nav" aria-label={t("sections")}>
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
        </nav>}
      </>
    )}


    </>
  );
}
