import { useEffect, useMemo, useRef, useState } from "react";
import type { CardTheme, Contact, ContactKind, PublicContact } from "@/lib/card/visibility.ts";
import { CARD_THEMES, toPublicContacts } from "@/lib/card/visibility.ts";
import { api } from "@/lib/client.ts";
import {
  derivePasswordKeys,
  deriveRecoveryKeys,
  encodeAuthKey,
  generateDataKey,
  generateRecoveryCode,
  keysFromParams,
  type KdfParams,
  unwrapDataKey,
  wrapDataKey,
  type WrappedKey,
} from "@/lib/crypto.ts";
import { startSyncLoop } from "@/lib/data/sync.ts";
import { checkPassword, PASSWORD_MIN } from "@/lib/password-policy.ts";
import { LANGS, detectLang, isRtl, translate, type Lang, type MsgKey } from "@/lib/i18n.ts";
import { CardHero } from "./qr-card.tsx";

type Screen =
  | "welcome"
  | "signup-nick"
  | "signup-pass"
  | "signup-2fa"
  | "signup-code"
  | "signup-done"
  | "login"
  | "login-2fa"
  | "recovery"
  | "recovery-done"
  | "today"
  | "finance"
  | "work"
  | "more"
  | "profile"
  | "visa"
  | "diary"
  | "sport"
  | "plans"
  | "card"
  | "card-themes";

type Meta = { testMode: boolean; storeKind: string; nickFormat: string; env: string; cardOrigin: string };

type SessionState = {
  nick: string;
  theme: CardTheme;
  appearance: "dark" | "light";
  contacts: Contact[];
  wrapPassword?: WrappedKey;
  kdf?: { password: KdfParams; recovery: KdfParams };
  cardPath: string;
};

const GLYPH: Record<ContactKind, string> = {
  telegram: "TG",
  whatsapp: "WA",
  signal: "SG",
  discord: "DC",
  steam: "ST",
  snapchat: "SN",
  email: "@",
  other: "+",
};

function Brand() {
  return (
    <div className="brand">
      <span className="monopl">
        <img className="mono" src="/amr-mono.png" alt="" />
      </span>
      <span className="appname">AMR ID</span>
    </div>
  );
}

function TestBanner({ code, t }: { code?: string; t: (k: MsgKey) => string }) {
  if (!code) return null;
  return (
    <div className="test-banner" role="status">
      <b>{t("test_banner")}</b>
      {t("test_otp")}
      <div className="code">{code}</div>
    </div>
  );
}

function Header({ title, onBack, tool }: { title?: string; onBack?: () => void; tool?: React.ReactNode }) {
  return (
    <div className="hd">
      {onBack ? (
        <button className="back" type="button" onClick={onBack} aria-label="back">
          ‹
        </button>
      ) : (
        <Brand />
      )}
      {title ? <div className="ttl">{title}</div> : null}
      {tool ?? <div className="sp" />}
    </div>
  );
}

export function IdApp() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const t = (k: MsgKey) => translate(lang, k);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [appearance, setAppearance] = useState<"dark" | "light">("dark");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [testOtp, setTestOtp] = useState<string | undefined>();

  const [nick, setNick] = useState("");
  const [nickStatus, setNickStatus] = useState<"free" | "taken" | "format" | "">("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [channel, setChannel] = useState<"telegram" | "email">("telegram");
  const [dest, setDest] = useState("");
  const [otpId, setOtpId] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const dataKeyRef = useRef<Uint8Array | null>(null);
  const accountIdRef = useRef<string | null>(null);

  const [sheet, setSheet] = useState<"kind" | "value" | null>(null);
  const [newKind, setNewKind] = useState<ContactKind>("telegram");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    localStorage.setItem("amrid.lang", lang);
  }, [lang]);

  useEffect(() => {
    void api<Meta>("/api/meta").then((r) => {
      if (r.ok) setMeta(r.data);
    });
    void api<SessionState>("/api/me").then((r) => {
      if (r.ok) {
        setSession(r.data);
        setAppearance(r.data.appearance);
        setScreen("today");
      }
    });
  }, []);

  useEffect(() => {
    return startSyncLoop(() => ({ key: dataKeyRef.current, accountId: accountIdRef.current }));
  }, []);

  useEffect(() => {
    accountIdRef.current = session?.nick ?? null;
  }, [session]);

  const origin = meta?.cardOrigin || (typeof window !== "undefined" ? window.location.origin : "");
  const cardUrl = session ? `${origin}${session.cardPath}` : origin;
  const publicContacts: PublicContact[] = useMemo(
    () => (session ? toPublicContacts(session.contacts, t("listed_by_owner")) : []),
    [session, lang],
  );

  function fail(status: number, data: { error?: string }) {
    if (status === 429) setErr(t("rate_limited"));
    else if (data.error === "invalid_code" || data.error === "invalid_credentials") setErr(t("invalid_code"));
    else if (data.error === "nick_taken") setErr(t("nick_taken_hint"));
    else if (data.error === "password_short") setErr(t("password_short"));
    else if (data.error === "password_weak" || data.error === "same_as_nick") setErr(t("password_weak"));
    else if (data.error === "recovery_replaced") setErr(t("new_recovery_issued"));
    else setErr(t("error"));
  }

  async function suggestNick() {
    const r = await api<{ nick: string }>("/api/nick/suggest");
    if (r.ok) {
      setNick(r.data.nick);
      setNickStatus("free");
    }
  }

  async function checkNick(value: string) {
    setNick(value);
    if (value.trim().length < 5) {
      setNickStatus("");
      return;
    }
    const r = await api<{ ok: boolean; reason?: string }>(`/api/nick/check?nick=${encodeURIComponent(value)}`);
    if (!r.ok) return;
    setNickStatus(r.data.ok ? "free" : ((r.data.reason as "taken" | "format") ?? "taken"));
  }

  async function submitSignup() {
    setErr("");
    setBusy(true);
    try {
      const policy = checkPassword(password, nick);
      if (!policy.ok) {
        setErr(t(policy.reason === "short" ? "password_short" : "password_weak"));
        return;
      }
      const rec = generateRecoveryCode();
      const dataKey = await generateDataKey();
      dataKeyRef.current = dataKey;
      const pwd = await derivePasswordKeys(password);
      const recKeys = await deriveRecoveryKeys(rec);
      const wrapPassword = await wrapDataKey(dataKey, pwd.wrapKey);
      const wrapRecovery = await wrapDataKey(dataKey, recKeys.wrapKey);
      const r = await api<{ otpId: string; nick: string; testOtp?: string }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          nick,
          authKey: encodeAuthKey(pwd.authKey),
          recoveryVerifyKey: encodeAuthKey(recKeys.verifyKey),
          kdfPassword: pwd.params,
          kdfRecovery: recKeys.params,
          wrapPassword,
          wrapRecovery,
          channel,
          dest,
          lang,
        }),
      });
      if (!r.ok) return fail(r.status, r.data as { error?: string });
      setNick(r.data.nick);
      setOtpId(r.data.otpId);
      setTestOtp(r.data.testOtp);
      setRecovery(rec);
      setScreen("signup-code");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(kind: "signup" | "login") {
    setErr("");
    setBusy(true);
    try {
      const r = await api<SessionState & { wrapPassword: WrappedKey }>("/api/auth/otp", {
        method: "POST",
        body: JSON.stringify({ otpId, code }),
      });
      if (!r.ok) return fail(r.status, r.data as { error?: string });
      if (kind === "login" && r.data.wrapPassword && r.data.kdf) {
        try {
          const { salt, opts } = keysFromParams(r.data.kdf.password);
          const pwd = await derivePasswordKeys(password, salt, opts);
          dataKeyRef.current = await unwrapDataKey(r.data.wrapPassword, pwd.wrapKey);
        } catch {
          setErr(t("error"));
          return;
        }
      }
      setSession(r.data);
      setAppearance(r.data.appearance);
      setTestOtp(undefined);
      setScreen(kind === "signup" ? "signup-done" : "today");
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin() {
    setErr("");
    setBusy(true);
    try {
      const kdfRes = await api<{ kdf: KdfParams }>("/api/auth/kdf", {
        method: "POST",
        body: JSON.stringify({ nick, purpose: "login" }),
      });
      if (!kdfRes.ok || !kdfRes.data.kdf) return fail(kdfRes.status, kdfRes.data as { error?: string });
      const { salt, opts } = keysFromParams(kdfRes.data.kdf);
      const pwd = await derivePasswordKeys(password, salt, opts);
      const r = await api<{ otpId: string; testOtp?: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ nick, authKey: encodeAuthKey(pwd.authKey), channel, dest: dest || undefined, lang }),
      });
      if (!r.ok) return fail(r.status, r.data as { error?: string });
      setOtpId(r.data.otpId);
      setTestOtp(r.data.testOtp);
      setScreen("login-2fa");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    dataKeyRef.current = null;
    setSession(null);
    setPassword("");
    setRecovery("");
    setScreen("welcome");
  }

  async function saveProfile(patch: Partial<SessionState>) {
    if (!session) return;
    const next = { ...session, ...patch };
    setSession(next);
    await api("/api/me", { method: "PATCH", body: JSON.stringify(patch) });
  }

  async function addContact() {
    if (!session || !newValue.trim()) return;
    const r = await api<{ contact: Contact; otpId?: string; testOtp?: string }>("/api/me/contacts", {
      method: "POST",
      body: JSON.stringify({ kind: newKind, value: newValue.trim(), visible: newKind !== "whatsapp", lang }),
    });
    if (!r.ok) return;
    setSession({ ...session, contacts: [...session.contacts, r.data.contact] });
    setSheet(null);
    setNewValue("");
    if (r.data.testOtp) setTestOtp(r.data.testOtp);
    if (r.data.otpId) setOtpId(r.data.otpId);
  }

  async function toggleContact(c: Contact) {
    if (!session) return;
    const contacts = session.contacts.map((x) => (x.id === c.id ? { ...x, visible: !x.visible } : x));
    await saveProfile({ contacts });
  }

  function shareCard() {
    if (navigator.share) void navigator.share({ title: session?.nick, url: cardUrl });
    else void navigator.clipboard.writeText(cardUrl);
  }

  function saveVcard() {
    if (!session) return;
    const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${session.nick}`, `URL:${cardUrl}`];
    for (const c of publicContacts) {
      if (c.kind === "email" && c.display) lines.push(`EMAIL:${c.display}`);
      if (c.href) lines.push(`X-SOCIALPROFILE:${c.href}`);
    }
    lines.push("END:VCARD");
    const blob = new Blob([lines.join("\n")], { type: "text/vcard" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${session.nick.replace("@", "")}.vcf`;
    a.click();
  }

  const skin = session && (screen === "card" || screen === "card-themes") ? `skin-${session.theme}` : "";
  const cls = `app ${appearance === "light" ? "light" : "dark"} ${skin}`;
  const inShell = session && ["today", "finance", "work", "more", "profile"].includes(screen);

  function Soon({ title }: { title: string }) {
    return (
      <>
        <Header title={title} onBack={() => setScreen("more")} />
        <div className="page">
          <div className="soon">
            <h2>{t("soon")}</h2>
            <p>{t("soon_sub")}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={cls} dir={isRtl(lang) ? "rtl" : "ltr"} lang={lang}>
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
          <Header title={t("password")} onBack={() => setScreen("signup-nick")} />
          <div className="page auth">
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
            <p className="hint">{t("password_hint")}</p>
            {password && password2 && password !== password2 ? <div className="err">{t("mismatch")}</div> : null}
            {err ? <div className="err">{err}</div> : null}
            <div className="btns">
              <button
                className={`btn p ${checkPassword(password, nick).ok === false || password !== password2 ? "off" : ""}`}
                type="button"
                onClick={() => {
                  const policy = checkPassword(password, nick);
                  if (!policy.ok) {
                    setErr(t(policy.reason === "short" ? "password_short" : "password_weak"));
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
            <div className="seg">
              <button type="button" className={channel === "telegram" ? "on" : ""} onClick={() => setChannel("telegram")}>
                {t("telegram")}
              </button>
              <button type="button" className={channel === "email" ? "on" : ""} onClick={() => setChannel("email")}>
                {t("email")}
              </button>
            </div>
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
              <label>{t("recovery_code")}</label>
              <div className="recovery-code">{recovery}</div>
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
              onDone={(s, key, newCode) => {
                dataKeyRef.current = key;
                setSession(s);
                setAppearance(s.appearance);
                if (newCode) {
                  setRecovery(newCode);
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
              <label>{t("recovery_code")}</label>
              <div className="recovery-code">{recovery}</div>
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

      {inShell && session && (
        <>
          <Header title={screen === "today" ? t("today") : screen === "finance" ? t("finance") : screen === "work" ? t("work") : screen === "more" ? t("more") : t("profile")} />
          <div className="page withnav">
            {screen === "today" && (
              <div className="soon">
                <h2>{t("today")}</h2>
                <p>{t("today_empty")}</p>
              </div>
            )}
            {screen === "finance" && (
              <div className="soon">
                <h2>{t("finance")}</h2>
                <p>{t("soon_sub")}</p>
              </div>
            )}
            {screen === "work" && (
              <div className="soon">
                <h2>{t("work")}</h2>
                <p>{t("soon_sub")}</p>
              </div>
            )}
            {screen === "more" && (
              <div className="tiles">
                {(["visa", "diary", "sport", "plans", "card"] as const).map((k) => (
                  <button key={k} className="tile" type="button" onClick={() => setScreen(k)}>
                    <b>{t(k)}</b>
                  </button>
                ))}
              </div>
            )}
            {screen === "profile" && (
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
                          <span>{c.verified ? "" : t("verify")}</span>
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
                  <button className="btn t" type="button" onClick={() => void logout()}>
                    {t("sign_out")}
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

      {session && screen === "visa" && <Soon title={t("visa")} />}
      {session && screen === "diary" && <Soon title={t("diary")} />}
      {session && screen === "sport" && <Soon title={t("sport")} />}
      {session && screen === "plans" && <Soon title={t("plans")} />}

      {session && screen === "card" && (
        <>
          <Header title={t("card")} onBack={() => setScreen("more")} tool={<button className="tool" type="button" onClick={() => setScreen("card-themes")}>⋯</button>} />
          <div className="page">
            <CardHero
              nick={session.nick}
              url={cardUrl}
              theme={session.theme}
              contacts={publicContacts}
              lang={lang}
              domain={origin.replace(/^https?:\/\//, "")}
              onShare={shareCard}
              onSave={shareCard}
              onVcard={saveVcard}
            />
          </div>
        </>
      )}

      {session && screen === "card-themes" && (
        <>
          <Header title={t("card_theme")} onBack={() => setScreen("card")} />
          <div className="page">
            <div className="thum-grid">
              {CARD_THEMES.map((th) => (
                <button
                  key={th}
                  type="button"
                  className={`thum ${session.theme === th ? "on" : ""}`}
                  onClick={() => void saveProfile({ theme: th })}
                >
                  <div className={`thum-prev skin-mini-${th}`}>
                    <b>{session.nick}</b>
                  </div>
                  <div className="thum-name">{t(`theme_${th}` as MsgKey)}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {sheet && session && (
        <>
          <div className="dim" onClick={() => setSheet(null)} />
          <div className="sheet">
            <div className="handle" />
            {sheet === "kind" && (
              <>
                <h2>{t("which_contact")}</h2>
                <div className="svc-grid">
                  {(["telegram", "whatsapp", "signal", "discord", "steam", "snapchat", "email", "other"] as const).map((k) => (
                    <button
                      key={k}
                      className="svc"
                      type="button"
                      onClick={() => {
                        setNewKind(k);
                        setSheet("value");
                      }}
                    >
                      <span className="glyph">{GLYPH[k]}</span>
                      <span>
                        {k === "telegram" ? t("telegram") : k === "email" ? t("email") : k === "whatsapp" ? t("wa") : k === "other" ? t("other_service") : t(k as MsgKey)}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {sheet === "value" && (
              <>
                <h2>{t("contact_value")}</h2>
                <div className="field">
                  <div className="box">
                    <input value={newValue} onChange={(e) => setNewValue(e.target.value)} autoCapitalize="off" />
                  </div>
                </div>
                <TestBanner code={testOtp} t={t} />
                <div className="btns">
                  <button className="btn p" type="button" onClick={() => void addContact()}>
                    {t("next")}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LangPicker({ lang, setLang, t }: { lang: Lang; setLang: (l: Lang) => void; t: (k: MsgKey) => string }) {
  const labels: Record<Lang, string> = { ru: "RU", ar: "AR", uz: "UZ", tj: "TJ", en: "EN" };
  return (
    <div className="group">
      <div className="lab">{t("lang")}</div>
      <div className="cit">
        {LANGS.map((l) => (
          <button key={l} type="button" className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
            {labels[l]}
          </button>
        ))}
      </div>
    </div>
  );
}

function RecoveryForm({
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
  onDone: (s: SessionState, key: Uint8Array, newRecoveryCode?: string) => void;
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
      const kdfRes = await api<{ kdf: KdfParams }>("/api/auth/kdf", {
        method: "POST",
        body: JSON.stringify({ nick, purpose: "recovery" }),
      });
      if (!kdfRes.ok || !kdfRes.data.kdf) {
        onError(kdfRes.status, kdfRes.data as { error?: string });
        return;
      }
      const recOld = await deriveRecoveryKeys(recovery, keysFromParams(kdfRes.data.kdf).salt, keysFromParams(kdfRes.data.kdf).opts);
      const first = await api<{ wrapRecovery: WrappedKey; needsPassword?: boolean; nick?: string; kdf?: { password: KdfParams; recovery: KdfParams } }>(
        "/api/auth/recovery",
        {
          method: "POST",
          body: JSON.stringify({ nick, recoveryVerifyKey: encodeAuthKey(recOld.verifyKey), phase: "unlock" }),
        },
      );
      if (!first.ok || !first.data.wrapRecovery) {
        onError(first.status, first.data as { error?: string });
        return;
      }
      const key = await unwrapDataKey(first.data.wrapRecovery, recOld.wrapKey);
      const newCode = generateRecoveryCode();
      const pwd = await derivePasswordKeys(password);
      const recNew = await deriveRecoveryKeys(newCode);
      const wrapPassword = await wrapDataKey(key, pwd.wrapKey);
      const wrapRecovery = await wrapDataKey(key, recNew.wrapKey);
      const second = await api<SessionState>("/api/auth/recovery", {
        method: "POST",
        body: JSON.stringify({
          nick,
          recoveryVerifyKey: encodeAuthKey(recOld.verifyKey),
          authKey: encodeAuthKey(pwd.authKey),
          wrapPassword,
          wrapRecovery,
          recoveryVerifyKeyNew: encodeAuthKey(recNew.verifyKey),
          kdfPassword: pwd.params,
          kdfRecovery: recNew.params,
          phase: "reset",
        }),
      });
      if (!second.ok) {
        onError(second.status, second.data as { error?: string });
        return;
      }
      onDone(second.data, key, newCode);
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
