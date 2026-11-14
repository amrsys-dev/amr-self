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
  generateRecoveryCodes,
  keysFromParams,
  type KdfParams,
  unwrapDataKey,
  wrapDataKey,
  type WrappedKey,
} from "@/lib/crypto.ts";
import { deriveRecoveryCandidates, encodedVerifyKeys, recoveryKdfList } from "@/lib/auth/recovery-client.ts";
import { startSyncLoop, wipeLocalData } from "@/lib/data/sync.ts";
import { checkPassword } from "@/lib/password-policy.ts";
import { LANGS, detectLang, isRtl, translate, type Lang, type MsgKey } from "@/lib/i18n.ts";
import { CardHero } from "./qr-card.tsx";
import { SelfWorkspace } from "./self-workspace.tsx";

type Screen =
  | "welcome"
  | "signup-nick"
  | "signup-pass"
  | "signup-2fa"
  | "signup-code"
  | "signup-tg-link"
  | "signup-done"
  | "login"
  | "login-2fa"
  | "login-tg-link"
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
  | "card-themes"
  | "sec-2fa-change"
  | "account-delete"
  | "nick-change"
  | "rebind-2fa";

type Meta = {
  testMode: boolean;
  storeKind: string;
  nickFormat: string;
  env: string;
  cardOrigin: string;
  emailOtp?: boolean;
  recoveryCodes?: number;
  telegramBot?: string;
};

type SessionState = {
  nick: string;
  dataId?: string;
  theme: CardTheme;
  appearance: "dark" | "light";
  contacts: Contact[];
  wrapPassword?: WrappedKey;
  kdf?: { password: KdfParams; recovery: KdfParams };
  cardPath: string;
  nickChanged?: boolean;
};

const GLYPH: Record<ContactKind, string> = {
  telegram: "TG",
  whatsapp: "WA",
  signal: "SG",
  discord: "DC",
  steam: "ST",
  snapchat: "SN",
  youtube: "YT",
  email: "@",
  other: "+",
};

function Brand() {
  return (
    <div className="brand">
      <span className="monopl">
        <img className="mono" src="/amr-mono.png" alt="" />
      </span>
      <span className="appname">SELF</span>
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

function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const v = value.replace(/\D/g, "").slice(0, 6);
  return (
    <div className="otp-boxes">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="otp-box">
          {v[i] ?? ""}
        </span>
      ))}
      <input
        className="otp-hidden"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={v}
        maxLength={6}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-label="otp"
      />
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
  const [deepLink, setDeepLink] = useState("");
  const [linkToken, setLinkToken] = useState("");
  const [keyVersion, setKeyVersion] = useState(0);

  const [nick, setNick] = useState("");
  const [nickStatus, setNickStatus] = useState<"free" | "taken" | "format" | "">("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [channel, setChannel] = useState<"telegram" | "email">("telegram");
  const [dest, setDest] = useState("");
  const [otpId, setOtpId] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");
  const [newNick, setNewNick] = useState("");
  const [newNickStatus, setNewNickStatus] = useState<"free" | "taken" | "format" | "">("");
  const [pendingContactId, setPendingContactId] = useState("");
  const [rebindDest, setRebindDest] = useState("");
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
    accountIdRef.current = session ? (session.dataId ?? session.nick) : null;
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
    if (value.trim().replace(/^@/, "").replace(/(?:\.amr|@amr)$/i, "").length < 3) {
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
      const count = meta?.recoveryCodes ?? 10;
      const codes = generateRecoveryCodes(count);
      const dataKey = await generateDataKey();
      dataKeyRef.current = dataKey;
      const pwd = await derivePasswordKeys(password);
      const recKeys = [];
      for (const c of codes) recKeys.push(await deriveRecoveryKeys(c));
      const wrapPassword = await wrapDataKey(dataKey, pwd.wrapKey);
      const wrapRecoveries = [];
      for (const k of recKeys) wrapRecoveries.push(await wrapDataKey(dataKey, k.wrapKey));
      const r = await api<SessionState>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          nick,
          authKey: encodeAuthKey(pwd.authKey),
          recoveryVerifyKey: encodeAuthKey(recKeys[0]!.verifyKey),
          recoveryVerifyKeys: recKeys.map((k) => encodeAuthKey(k.verifyKey)),
          kdfPassword: pwd.params,
          kdfRecovery: recKeys[0]!.params,
          kdfRecoveries: recKeys.map((k) => k.params),
          wrapPassword,
          wrapRecovery: wrapRecoveries[0],
          wrapRecoveries,
        }),
      });
      if (!r.ok) return fail(r.status, r.data as { error?: string });
      setNick(r.data.nick);
      setSession(r.data);
      setAppearance(r.data.appearance);
      setRecovery(codes[0] ?? "");
      setRecoveryCodes(codes);
      setTestOtp(undefined);
      setKeyVersion((v) => v + 1);
      setScreen("signup-done");
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
      setKeyVersion((v) => v + 1);
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
      const r = await api<SessionState & { otpId?: string; testOtp?: string; error?: string; deepLink?: string; linkToken?: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ nick, authKey: encodeAuthKey(pwd.authKey), lang }),
      });
      if (!r.ok) {
        if (r.status === 409 && r.data.error === "telegram_link_required" && r.data.deepLink && r.data.linkToken) {
          setDeepLink(r.data.deepLink);
          setLinkToken(r.data.linkToken);
          setScreen("login-tg-link");
          return;
        }
        return fail(r.status, r.data as { error?: string });
      }
      if (r.data.cardPath) {
        setSession(r.data);
        setAppearance(r.data.appearance);
        setTestOtp(undefined);
        setKeyVersion((v) => v + 1);
        setScreen("today");
        return;
      }
      if (!r.data.otpId) return fail(400, { error: "invalid" });
      setOtpId(r.data.otpId);
      setTestOtp(r.data.testOtp);
      setScreen("login-2fa");
    } finally {
      setBusy(false);
    }
  }


  useEffect(() => {
    if ((screen !== "signup-tg-link" && screen !== "login-tg-link") || !linkToken) return;
    let stop = false;
    const poll = async () => {
      const r = await api<SessionState & { status?: string }>("/api/auth/telegram-link?token=" + encodeURIComponent(linkToken));
      if (stop) return;
      if (r.status === 410 || r.data.status === "expired") {
        setErr(t("link_expired"));
        return;
      }
      if (!r.ok || r.data.status !== "linked") return;
      if (screen === "signup-tg-link" && r.data.nick) {
        setSession(r.data);
        if (r.data.appearance) setAppearance(r.data.appearance);
        setLinkToken("");
        setDeepLink("");
        setScreen("signup-done");
        return;
      }
      if (screen === "login-tg-link") {
        setLinkToken("");
        setDeepLink("");
        setErr("");
        setScreen("login");
        void submitLogin();
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 2000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [screen, linkToken]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    // Stop future sync ticks before deleting the local encrypted store.
    dataKeyRef.current = null;
    accountIdRef.current = null;
    setKeyVersion((v) => v + 1);
    await wipeLocalData();
    setSession(null);
    setPassword("");
    setRecovery("");
    setScreen("welcome");
  }

  async function afterWipe() {
    // Prevent an in-flight sync loop from repopulating IndexedDB after a wipe.
    dataKeyRef.current = null;
    accountIdRef.current = null;
    setKeyVersion((v) => v + 1);
    await wipeLocalData();
    setSession(null);
    setPassword("");
    setReauthPassword("");
    setRecovery("");
    setRecoveryCodes([]);
    setCode("");
    setOtpId("");
    setScreen("welcome");
  }

  async function authKeyFrom(pw: string) {
    if (!session?.kdf?.password) throw new Error("no kdf");
    const { salt, opts } = keysFromParams(session.kdf.password);
    const pwd = await derivePasswordKeys(pw, salt, opts);
    return encodeAuthKey(pwd.authKey);
  }


  async function checkNickStatus(value: string) {
    if (value.trim().replace(/^@/, "").replace(/(?:\.amr|@amr)$/i, "").length < 3) {
      setNewNickStatus("");
      return;
    }
    const r = await api<{ ok: boolean; reason?: string }>(`/api/nick/check?nick=${encodeURIComponent(value)}`);
    if (!r.ok) return;
    setNewNickStatus(r.data.ok ? "free" : ((r.data.reason as "taken" | "format") ?? "taken"));
  }

  async function submitNickChange() {
    if (!session) return;
    setErr("");
    setBusy(true);
    try {
      const authKey = await authKeyFrom(reauthPassword);
      const r = await api<{ nick: string; nickChanged: boolean; cardPath: string }>("/api/me/nick", {
        method: "POST",
        body: JSON.stringify({ nick: newNick, authKey }),
      });
      if (!r.ok) return fail(r.status, r.data as { error?: string });
      setSession({ ...session, nick: r.data.nick, nickChanged: true, cardPath: r.data.cardPath });
      setReauthPassword("");
      setScreen("profile");
    } catch {
      setErr(t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function submitChannelChange() {
    if (!session) return;
    setErr("");
    setBusy(true);
    try {
      const contact = session.contacts.find((c) => c.id === pendingContactId) ?? session.contacts.find((c) => c.verified && c.kind === "telegram");
      if (!contact) {
        setErr(t("error"));
        return;
      }
      setPendingContactId(contact.id);
      const authKey = await authKeyFrom(reauthPassword);
      if (!otpId || code.replace(/\D/g, "").length < 6) {
        const start = await api<{ otpId: string; testOtp?: string }>("/api/me/otp-channel", {
          method: "POST",
          body: JSON.stringify({ phase: "start", contactId: contact.id, authKey, lang }),
        });
        if (!start.ok) return fail(start.status, start.data as { error?: string });
        setOtpId(start.data.otpId);
        setTestOtp(start.data.testOtp);
        return;
      }
      const confirm = await api<{ ok: boolean }>("/api/me/otp-channel", {
        method: "POST",
        body: JSON.stringify({ phase: "confirm", contactId: contact.id, authKey, otpId, code, lang }),
      });
      if (!confirm.ok) return fail(confirm.status, confirm.data as { error?: string });
      const me = await api<SessionState>("/api/me");
      if (me.ok) setSession(me.data);
      setReauthPassword("");
      setCode("");
      setOtpId("");
      setTestOtp(undefined);
      setScreen("profile");
    } catch {
      setErr(t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function submitDeleteAccount() {
    if (!session) return;
    setErr("");
    setBusy(true);
    try {
      const authKey = await authKeyFrom(reauthPassword);
      if (!otpId || code.replace(/\D/g, "").length < 6) {
        const start = await api<{ otpId: string; testOtp?: string }>("/api/me/delete", {
          method: "POST",
          body: JSON.stringify({ phase: "start", authKey, lang }),
        });
        if (!start.ok) return fail(start.status, start.data as { error?: string });
        setOtpId(start.data.otpId);
        setTestOtp(start.data.testOtp);
        return;
      }
      const del = await api("/api/me/delete", {
        method: "POST",
        body: JSON.stringify({ phase: "confirm", authKey, otpId, code }),
      });
      if (!del.ok) return fail(del.status, del.data as { error?: string });
      await afterWipe();
    } catch {
      setErr(t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function submitRebind() {
    setErr("");
    setBusy(true);
    try {
      const kdfRes = await api<{ kdf: KdfParams; kdfs?: KdfParams[] }>(
        "/api/auth/kdf",
        { method: "POST", body: JSON.stringify({ nick, purpose: "recovery" }) },
      );
      if (!kdfRes.ok) return fail(kdfRes.status, kdfRes.data as { error?: string });
      const list = kdfRes.data.kdfs?.length ? kdfRes.data.kdfs : kdfRes.data.kdf ? [kdfRes.data.kdf] : [];
      const verifyKeys = [];
      for (const params of list) {
        const { salt, opts } = keysFromParams(params);
        const rec = await deriveRecoveryKeys(recovery, salt, opts);
        verifyKeys.push(encodeAuthKey(rec.verifyKey));
      }
      const loginKdf = await api<{ kdf: KdfParams }>(
        "/api/auth/kdf",
        { method: "POST", body: JSON.stringify({ nick, purpose: "login" }) },
      );
      if (!loginKdf.ok || !loginKdf.data.kdf) return fail(loginKdf.status, loginKdf.data as { error?: string });
      const loginKeys = keysFromParams(loginKdf.data.kdf);
      const pwd = await derivePasswordKeys(password, loginKeys.salt, loginKeys.opts);
      if (!otpId) {
        const start = await api<{ otpId: string; testOtp?: string }>("/api/auth/recovery", {
          method: "POST",
          body: JSON.stringify({
            nick,
            recoveryVerifyKey: verifyKeys[0],
            recoveryVerifyKeys: verifyKeys,
            authKey: encodeAuthKey(pwd.authKey),
            phase: "rebind-start",
            channel: "telegram",
            dest: rebindDest,
            lang,
          }),
        });
        if (!start.ok) return fail(start.status, start.data as { error?: string });
        setOtpId(start.data.otpId);
        setTestOtp(start.data.testOtp);
        return;
      }
      const confirm = await api<SessionState>("/api/auth/recovery", {
        method: "POST",
        body: JSON.stringify({
          nick,
          recoveryVerifyKey: verifyKeys[0],
          recoveryVerifyKeys: verifyKeys,
          authKey: encodeAuthKey(pwd.authKey),
          phase: "rebind-confirm",
          otpId,
          code,
        }),
      });
      if (!confirm.ok) return fail(confirm.status, confirm.data as { error?: string });
      setSession(confirm.data);
      setAppearance(confirm.data.appearance);
      setTestOtp(undefined);
      setOtpId("");
      setCode("");
      setScreen("today");
    } catch {
      setErr(t("error"));
    } finally {
      setBusy(false);
    }
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
                murad.amr
              </div>
            </div>
            <div className="btns">
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
                <input value={nick} placeholder="murad" onChange={(e) => void checkNick(e.target.value)} autoCapitalize="off" autoCorrect="off" autoComplete="username" />
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
            <div className="field">
              <label>{t("password")}</label>
              <div className="box">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? t("hide_password") : t("show_password")}>{showPassword ? t("hide_password") : t("show_password")}</button>
              </div>
            </div>
            <div className="field">
              <label>{t("password_again")}</label>
              <div className="box">
                <input type={showPassword2 ? "text" : "password"} value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
                <button type="button" className="password-toggle" onClick={() => setShowPassword2((v) => !v)} aria-label={showPassword2 ? t("hide_password") : t("show_password")}>{showPassword2 ? t("hide_password") : t("show_password")}</button>
              </div>
            </div>
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
                  void submitSignup();
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
                <input value={nick} placeholder="yourname.amr" onChange={(e) => setNick(e.target.value)} autoCapitalize="off" />
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

      {inShell && session && (
        <>
          <Header title={screen === "today" ? t("today") : screen === "finance" ? t("finance") : screen === "work" ? t("work") : screen === "more" ? t("more") : t("profile")} />
          <div className="page withnav">
            {(screen === "today" || screen === "finance" || screen === "work" || screen === "more") && session && (
              <SelfWorkspace
                section={screen}
                accountId={session.dataId ?? session.nick}
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
                  {(["telegram", "whatsapp", "signal", "discord", "steam", "snapchat", "youtube", "email", "other"] as const).map((k) => (
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
                        {k === "telegram" ? t("telegram") : k === "email" ? t("email") : k === "whatsapp" ? t("wa") : k === "other" ? t("other_service") : k === "youtube" ? "YouTube" : t(k as MsgKey)}
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
