import { useEffect, useMemo, useRef, useState } from "react";
import { buildVcard, vcardFileName } from "@/lib/card/vcard.ts";
import { renderCardImage } from "@/lib/card/share-image.ts";
import { serviceName } from "../contact-icons.tsx";
import { contactDetail } from "../qr-card.tsx";
import type { Contact, ContactKind, PublicContact } from "@/lib/card/visibility.ts";
import { toPublicContacts } from "@/lib/card/visibility.ts";
import { api } from "@/lib/client.ts";
import {
  derivePasswordKeys,
  deriveRecoveryKeys,
  encodeAuthKey,
  generateDataKey,
  generateRecoveryCodes,
  keysFromParams,
  type KdfParams,
  unwrapDataKey,
  wrapDataKey,
  type WrappedKey,
} from "@/lib/crypto.ts";
import { loadLocalData, saveLocalData, startSyncLoop, wipeLocalData } from "@/lib/data/sync.ts";
import { loadGuestData, recallDataKey, rememberDataKey, requestPersistentStorage, saveGuestData, wipeDeviceStore } from "@/lib/data/device-store.ts";
import { backupFileName, buildBackup, parseBackup } from "@/lib/data/backup.ts";
import { stripHealthWithoutConsent } from "@/lib/health/consent.ts";
import type { UserData } from "@/lib/data/schema.ts";
import { checkPassword } from "@/lib/password-policy.ts";
import { detectLang, translate, type Lang, type MsgKey } from "@/lib/i18n.ts";
import { accountIdOf, type Meta, type Screen, type SessionState } from "./types.ts";

const GUEST_FLAG = "amrself.guest";
const THEME_KEY = "self.theme";
const MODE_KEY = "self.mode";
/** AMR Design System v1.0 theme families; each has a Light and a Dark mode. */
export const UI_THEMES = ["emerald", "graphite", "bronze"] as const;
export type UiTheme = (typeof UI_THEMES)[number];
export const UI_MODES = ["system", "light", "dark"] as const;
export type UiMode = (typeof UI_MODES)[number];
/** Old device settings (before the design system) mapped to family + mode. */
const LEGACY_THEME: Record<string, [UiTheme, UiMode | null]> = {
  saudi: ["emerald", "dark"], light: ["emerald", "light"],
  "emerald-saudi": ["emerald", null], "carbon-red": ["graphite", null], "digital-creator": ["graphite", null], "digital-tactical": ["graphite", null],
  "wood-metal": ["bronze", null], "cream-lavender": ["bronze", null], "rose-champagne": ["bronze", null],
};
const SHELL_SCREENS: readonly Screen[] = ["today", "finance", "work", "more", "profile"];

/** All app state and actions. Screens read what they need from the returned object. */
export function useIdApp() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const t = (k: MsgKey) => translate(lang, k);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [appearance, setAppearance] = useState<"dark" | "light">("dark");
  const [uiTheme, setUiTheme] = useState<UiTheme | null>(null);
  const [uiMode, setUiMode] = useState<UiMode>("system");
  const [systemDark, setSystemDark] = useState(true);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  // «Войти через AMR ID»: после входа вернуть пользователя на экран согласия (/connect).
  useEffect(() => {
    if (!session) return;
    try {
      let pending = sessionStorage.getItem("amr-connect-pending");
      const saved = localStorage.getItem("amr-connect-pending");
      sessionStorage.removeItem("amr-connect-pending");
      localStorage.removeItem("amr-connect-pending");
      if (!pending && saved) {
        const d = JSON.parse(saved) as { v?: unknown; exp?: unknown };
        if (typeof d.v === "string" && typeof d.exp === "number" && d.exp > Date.now()) pending = d.v;
      }
      if (pending && /^\/connect\?[\w=&%.-]+$/.test(pending)) location.assign(pending);
    } catch {
      /* storage blocked */
    }
  }, [session]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [testOtp, setTestOtp] = useState<string | undefined>();
  const [deepLink, setDeepLink] = useState("");
  const [linkToken, setLinkToken] = useState("");
  const [keyVersion, setKeyVersion] = useState(0);
  /** Using the assistant on this device without an account. */
  const [guest, setGuest] = useState(false);
  const [backupMsg, setBackupMsg] = useState<MsgKey | "">("");

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
    void requestPersistentStorage();
    const savedTheme = localStorage.getItem(THEME_KEY) ?? "";
    const savedMode = localStorage.getItem(MODE_KEY) ?? "";
    if ((UI_THEMES as readonly string[]).includes(savedTheme)) setUiTheme(savedTheme as UiTheme);
    else if (LEGACY_THEME[savedTheme]) {
      const [fam, mode] = LEGACY_THEME[savedTheme]!;
      setUiTheme(fam);
      localStorage.setItem(THEME_KEY, fam);
      if (mode && !savedMode) {
        setUiMode(mode);
        localStorage.setItem(MODE_KEY, mode);
      }
    }
    if ((UI_MODES as readonly string[]).includes(savedMode)) setUiMode(savedMode as UiMode);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (mq) {
      setSystemDark(mq.matches);
      mq.addEventListener?.("change", (e) => setSystemDark(e.matches));
    }
    if (localStorage.getItem(GUEST_FLAG) === "1") {
      setGuest(true);
      setScreen("today");
    }
    void api<Meta>("/api/meta").then((r) => {
      if (r.ok) setMeta(r.data);
    });
    void api<SessionState>("/api/me").then(async (r) => {
      if (r.ok) {
        // The data key is only in memory after login. Get it back from the
        // device store so the password is not asked on every launch.
        const key = await recallDataKey(accountIdOf(r.data));
        if (key) {
          dataKeyRef.current = key;
          setKeyVersion((v) => v + 1);
        }
        setSession(r.data);
        setAppearance(r.data.appearance);
        const back = new URLSearchParams(window.location.search);
        const g = back.get("google");
        setScreen(back.get("delete") === "google" ? "account-delete" : (g === "ok" ? "card" : "today"));
      }
      const g = new URLSearchParams(window.location.search).get("google");
      if (g === "ok") markGoogleSignIn();
      if (g && g !== "ok" && g !== "linked" && g !== "otp") setErr(t(googleMsg(g)));
      // Google sign-in on an account with Telegram: finish with the Telegram login code (pending id is in an HttpOnly cookie).
      if (!r.ok && g === "otp") {
        setOtpId("");
        setTestOtp(new URLSearchParams(window.location.search).get("t") ?? undefined);
        setScreen("login-2fa");
        window.history.replaceState(null, "", window.location.pathname);
      }
      if (g || new URLSearchParams(window.location.search).has("delete")) window.history.replaceState(null, "", window.location.pathname);
    });
  }, []);

  useEffect(() => {
    if (session && dataKeyRef.current) void rememberDataKey(accountIdOf(session), dataKeyRef.current);
  }, [session, keyVersion]);

  useEffect(() => {
    return startSyncLoop(() => ({ key: dataKeyRef.current, accountId: accountIdRef.current }));
  }, []);

  useEffect(() => {
    accountIdRef.current = session ? accountIdOf(session) : null;
  }, [session]);

  const origin = "https://self.amrsys.net"; // public card always on the production domain, never a Vercel preview
  const cardUrl = session ? `${origin}${session.cardPath}` : origin;
  const publicContacts: PublicContact[] = useMemo(
    () => (session ? toPublicContacts(session.contacts, t("listed_by_owner")) : []),
    [session, lang],
  );

  function fail(status: number, data: { error?: string }) {
    if (status === 429) setErr(t("rate_limited"));
    else if (data.error === "invalid_credentials") setErr(screen === "recovery" ? t("invalid_code") : t("wrong_login"));
    else if (data.error === "invalid_code") setErr(t("invalid_code"));
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
    } catch {
      // e.g. WebAssembly blocked or out of memory while deriving keys: say so instead of doing nothing
      setErr(t("error"));
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
        body: JSON.stringify(otpId ? { otpId, code } : { code }),
      });
      if (!r.ok) return fail(r.status, r.data as { error?: string });
      if ((r.data as { method?: string }).method === "google") markGoogleSignIn();
      if (kind === "login" && password && r.data.wrapPassword && r.data.kdf) {
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
    } catch {
      // e.g. WebAssembly blocked or out of memory while deriving keys: say so instead of doing nothing
      setErr(t("error"));
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
    } catch {
      // e.g. WebAssembly blocked or out of memory while deriving keys: say so instead of doing nothing
      setErr(t("error"));
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
    await wipeDeviceStore();
    endGuest();
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
    await wipeDeviceStore();
    endGuest();
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

  /**
   * Delete account in ONE step, with the method this session signed in with:
   * Telegram → a fresh code from the bot (sent on open, again after 60 s); AMR account → current password;
   * Google → a fresh sign-in at Google, then «Удалить». No word lists, no chains.
   */
  const [deleteResendAt, setDeleteResendAt] = useState(0);
  /** After «Войти через Google» the data key is not known yet: the lock screen asks for the password. */
  const [googleSignIn, setGoogleSignIn] = useState(false);
  function markGoogleSignIn() {
    setGoogleSignIn(true);
    try {
      sessionStorage.setItem("amr-google-signin", "1");
    } catch {
      /* private mode */
    }
  }
  useEffect(() => {
    try {
      if (sessionStorage.getItem("amr-google-signin") === "1") setGoogleSignIn(true);
    } catch {
      /* private mode */
    }
  }, []);
  const [deleteMethod, setDeleteMethod] = useState<"" | "telegram" | "password" | "google">("");
  const [deleteGoogleReady, setDeleteGoogleReady] = useState(false);
  async function sendDeleteCode() {
    if (!session) return;
    setErr("");
    setBusy(true);
    try {
      const r = await api<{ method?: "telegram" | "password" | "google"; ready?: boolean; otpId?: string; testOtp?: string; retryAfterMs?: number; resendInMs?: number; error?: string }>("/api/me/delete", {
        method: "POST",
        body: JSON.stringify({ phase: "start", lang }),
      });
      if (r.data.method) setDeleteMethod(r.data.method);
      if (r.data.method === "password") return;
      if (r.data.method === "google") return setDeleteGoogleReady(Boolean(r.data.ready));
      if (r.ok) {
        setOtpId(r.data.otpId ?? "");
        setTestOtp(r.data.testOtp);
        setCode("");
        setDeleteResendAt(Date.now() + (r.data.resendInMs ?? 60_000));
        return;
      }
      // A code was sent less than a minute ago: keep using it.
      if (r.status === 429 && r.data.otpId) {
        setOtpId(r.data.otpId);
        setDeleteResendAt(Date.now() + (r.data.retryAfterMs ?? 60_000));
        return;
      }
      if (r.data.error === "no_otp_dest") return setErr(t("delete_no_tg"));
      return fail(r.status, r.data);
    } catch {
      setErr(t("error"));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (screen === "account-delete" && session && !otpId) void sendDeleteCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  /** Google is started with a same-site form POST (the server checks Origin). */
  function startGoogle(purpose: "login" | "link" | "delete") {
    const f = document.createElement("form");
    f.method = "POST";
    f.action = "/api/auth/google/start";
    const i = document.createElement("input");
    i.type = "hidden";
    i.name = "purpose";
    i.value = purpose;
    f.appendChild(i);
    document.body.appendChild(f);
    f.submit();
  }

  /** Link / unlink Google: fresh proof first (Telegram code with purpose=google-link, or the current password). */
  const [googleAction, setGoogleAction] = useState<"link" | "unlink">("link");
  const [googleProof, setGoogleProof] = useState<"" | "telegram" | "password">("");
  const [googleResendAt, setGoogleResendAt] = useState(0);
  function openGoogleLink(action: "link" | "unlink") {
    setGoogleAction(action);
    setGoogleProof("");
    setReauthPassword("");
    setCode("");
    setOtpId("");
    setTestOtp(undefined);
    setErr("");
    setScreen("google-link");
    void sendGoogleCode(action);
  }
  async function sendGoogleCode(action = googleAction) {
    if (!session) return;
    setErr("");
    setBusy(true);
    try {
      const r = await api<{ proof?: "telegram" | "password"; otpId?: string; testOtp?: string; retryAfterMs?: number; resendInMs?: number; error?: string }>("/api/me/google", {
        method: "POST",
        body: JSON.stringify({ action, phase: "start", lang }),
      });
      if (r.data.proof) setGoogleProof(r.data.proof);
      if (r.ok && r.data.otpId) {
        setOtpId(r.data.otpId);
        setTestOtp(r.data.testOtp);
        setGoogleResendAt(Date.now() + (r.data.resendInMs ?? 60_000));
        return;
      }
      if (r.status === 429 && r.data.otpId) {
        setOtpId(r.data.otpId);
        setGoogleResendAt(Date.now() + (r.data.retryAfterMs ?? 60_000));
        return;
      }
      if (!r.ok) return fail(r.status, r.data);
    } catch {
      setErr(t("error"));
    } finally {
      setBusy(false);
    }
  }
  async function submitGoogleLink() {
    if (!session) return;
    let proof: Record<string, unknown>;
    if (googleProof === "password") {
      if (!reauthPassword) return setErr(t("wrong_login"));
      proof = { authKey: await authKeyFrom(reauthPassword) };
    } else {
      if (!otpId || code.replace(/\D/g, "").length < 6) return setErr(t("invalid_code"));
      proof = { otpId, code };
    }
    setErr("");
    setBusy(true);
    try {
      const r = await api<{ ok?: boolean; next?: string; error?: string }>("/api/me/google", {
        method: "POST",
        body: JSON.stringify({ action: googleAction, phase: "confirm", lang, ...proof }),
      });
      if (!r.ok) return fail(r.status, r.data);
      setReauthPassword("");
      setCode("");
      setOtpId("");
      if (googleAction === "link") return startGoogle("link");
      const me = await api<SessionState>("/api/me");
      if (me.ok) setSession(me.data);
      setScreen("profile");
    } catch {
      setErr(t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function submitDeleteAccount() {
    if (!session) return;
    let payload: Record<string, unknown>;
    if (deleteMethod === "password") {
      if (!reauthPassword) return setErr(t("wrong_login"));
      payload = { phase: "confirm", authKey: await authKeyFrom(reauthPassword) };
    } else if (deleteMethod === "google") {
      if (!deleteGoogleReady) return startGoogle("delete");
      payload = { phase: "confirm" };
    } else {
      if (!otpId) return void sendDeleteCode();
      if (code.replace(/\D/g, "").length < 6) return setErr(t("invalid_code"));
      payload = { phase: "confirm", otpId, code };
    }
    setErr("");
    setBusy(true);
    try {
      const del = await api("/api/me/delete", { method: "POST", body: JSON.stringify(payload) });
      if (!del.ok) {
        if (deleteMethod === "google") setDeleteGoogleReady(false);
        return fail(del.status, del.data as { error?: string });
      }
      setReauthPassword("");
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

  async function removeContact(c: Contact) {
    if (!session) return;
    const contacts = session.contacts.filter((x) => x.id !== c.id);
    await saveProfile({ contacts });
  }

  function shareCard() {
    if (!session) return;
    const data = { title: `${session.nick} · AMR ID`, text: session.nick, url: cardUrl };
    if (navigator.share) void navigator.share(data).catch(() => undefined);
    else void navigator.clipboard.writeText(cardUrl);
  }

  /** Small JPEG of the card (tens of KB) for a chat; falls back to a download. */
  async function shareCardImage() {
    if (!session) return;
    const blob = await renderCardImage({
      nick: session.nick,
      url: cardUrl,
      theme: session.theme,
      contacts: publicContacts,
      name: (c) => serviceName(c.kind, t),
      // The image cannot be tapped, so it shows the real username or number.
      value: (c) => {
        const own = session.contacts.find((x) => x.id === c.id);
        if (c.kind === "whatsapp") return own?.value ?? "";
        return c.display || own?.value || contactDetail(c, t);
      },
      photo: session.photo,
    });
    const file = new File([blob], `${session.nick.replace(/^@/, "")}.jpg`, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: cardUrl }).catch(() => undefined);
      return;
    }
    downloadBlob(blob, file.name);
  }

  /** Cover photo for the card: shrunk on the phone to ~1000 px WebP (JPEG fallback) before upload. */
  async function uploadPhoto(file: File) {
    if (!session) return;
    // WebP for photos (smaller); browsers that cannot encode it (older Safari) fall back to JPEG.
    let blob = await shrinkImage(file, 1080, 0.8, "image/webp");
    if (blob.type !== "image/webp") blob = await shrinkImage(file, 1080, 0.8, "image/jpeg");
    const res = await fetch("/api/me/photo", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": blob.type }, body: blob });
    if (!res.ok) return;
    const data = (await res.json()) as { photo: string | null };
    setSession({ ...session, photo: data.photo });
  }

  async function removePhoto() {
    if (!session) return;
    await api("/api/me/photo", { method: "DELETE" });
    setSession({ ...session, photo: null });
  }

  function saveVcard() {
    if (!session) return;
    const blob = new Blob([buildVcard({ nick: session.nick, url: cardUrl, contacts: publicContacts })], { type: "text/vcard" });
    downloadBlob(blob, vcardFileName(session.nick));
  }

  const skin = session && (screen === "card" || screen === "card-themes") ? `skin-${session.theme}` : "";
  /** Device-level look: theme family + Light/Dark/System. The public card keeps its own theme. */
  const theme: UiTheme = uiTheme ?? "emerald";
  const mode: "light" | "dark" = uiMode === "system" ? (systemDark ? "dark" : "light") : uiMode;
  const cls = skin ? `app ${appearance} ${skin}` : `app ${mode} ds ds-${theme}`;

  function chooseTheme(next: UiTheme) {
    localStorage.setItem(THEME_KEY, next);
    setUiTheme(next);
  }

  function chooseMode(next: UiMode) {
    localStorage.setItem(MODE_KEY, next);
    setUiMode(next);
    const ap = next === "system" ? (systemDark ? "dark" : "light") : next;
    setAppearance(ap);
    if (session) void saveProfile({ appearance: ap });
  }
  const inShell = Boolean(session || guest) && SHELL_SCREENS.includes(screen);
  /** Passed to the workspace in guest mode; stable so it does not reload on every render. */
  const guestStore = useMemo(() => ({ load: loadGuestData, save: saveGuestData }), []);

  function startGuest() {
    localStorage.setItem(GUEST_FLAG, "1");
    setGuest(true);
    setScreen("today");
  }

  function endGuest() {
    localStorage.removeItem(GUEST_FLAG);
    setGuest(false);
  }

  /** Current data: the account store when signed in, else the guest store. */
  async function currentData(): Promise<UserData | null> {
    if (session) {
      const key = dataKeyRef.current;
      return key ? loadLocalData(key, accountIdOf(session)) : null;
    }
    return loadGuestData();
  }

  async function exportBackup() {
    setBackupMsg("");
    const data = await currentData();
    if (!data) {
      setBackupMsg("backup_need_password");
      return;
    }
    const blob = new Blob([buildBackup(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = backupFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    setBackupMsg("backup_saved");
  }

  async function importBackup(file: File) {
    setBackupMsg("");
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setBackupMsg(parsed.reason === "newer_version" ? "backup_newer" : "backup_bad_file");
      return;
    }
    // Same rule as sync: no health entries without consent (parseBackup already strips them).
    const restored = stripHealthWithoutConsent(parsed.data);
    if (session) {
      const key = dataKeyRef.current;
      if (!key) {
        setBackupMsg("backup_need_password");
        return;
      }
      // Marked dirty, so the sync loop uploads it on the next tick.
      await saveLocalData(key, accountIdOf(session), restored);
    } else {
      await saveGuestData(restored);
    }
    setKeyVersion((v) => v + 1); // reload the workspace with the restored data
    setBackupMsg("backup_restored");
  }

  return {
    lang,
    setLang,
    t,
    screen,
    setScreen,
    appearance,
    setAppearance,
    meta,
    setMeta,
    session,
    setSession,
    err,
    setErr,
    busy,
    setBusy,
    testOtp,
    setTestOtp,
    deepLink,
    setDeepLink,
    linkToken,
    setLinkToken,
    keyVersion,
    setKeyVersion,
    nick,
    setNick,
    nickStatus,
    setNickStatus,
    password,
    setPassword,
    password2,
    setPassword2,
    channel,
    setChannel,
    dest,
    setDest,
    otpId,
    setOtpId,
    code,
    setCode,
    recovery,
    setRecovery,
    recoveryCodes,
    setRecoveryCodes,
    showPassword,
    setShowPassword,
    showPassword2,
    setShowPassword2,
    reauthPassword,
    setReauthPassword,
    newNick,
    setNewNick,
    newNickStatus,
    setNewNickStatus,
    pendingContactId,
    setPendingContactId,
    rebindDest,
    setRebindDest,
    dataKeyRef,
    accountIdRef,
    sheet,
    setSheet,
    newKind,
    setNewKind,
    newValue,
    setNewValue,
    origin,
    cardUrl,
    publicContacts,
    fail,
    suggestNick,
    checkNick,
    submitSignup,
    submitOtp,
    submitLogin,
    logout,
    afterWipe,
    authKeyFrom,
    checkNickStatus,
    submitNickChange,
    submitChannelChange,
    submitDeleteAccount,
    sendDeleteCode,
    deleteResendAt,
    deleteMethod,
    deleteGoogleReady,
    startGoogle,
    googleAction,
    googleProof,
    googleResendAt,
    openGoogleLink,
    sendGoogleCode,
    submitGoogleLink,
    googleSignIn,
    submitRebind,
    saveProfile,
    addContact,
    toggleContact, removeContact,
    shareCard,
    shareCardImage,
    uploadPhoto,
    removePhoto,
    saveVcard,
    skin,
    cls,
    inShell,
    theme,
    chooseTheme,
    chooseMode,
    uiMode,
    guest,
    setGuest,
    backupMsg,
    setBackupMsg,
    guestStore,
    startGuest,
    endGuest,
    exportBackup,
    importBackup,
  };
}

export type App = ReturnType<typeof useIdApp>;

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Downscale a picked photo so the longest side is at most `max` px and encode as JPEG. */
export async function shrinkImage(file: Blob, max: number, quality: number, type = "image/jpeg"): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), type, quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Message for a failed return from Google (?google=…). */
export function googleMsg(code: string): MsgKey {
  if (code === "not_linked") return "google_not_linked";
  if (code === "taken") return "google_taken";
  if (code === "wrong_account") return "google_wrong_account";
  if (code === "not_fresh") return "google_not_fresh";
  if (code === "proof_required") return "google_proof_required";
  return "google_failed";
}
