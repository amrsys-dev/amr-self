import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { defaultContactVisible, isHttpsUrl, parseCardTheme, toPublicContacts, type Contact, type CardTheme } from "../card/visibility.ts";
import { argon2idMaster, decodeAuthKey, type KdfParams, type WrappedKey } from "../crypto.ts";
import { ARGON2_PARAMS } from "../crypto.ts";
import { b64url } from "../crypto.ts";
import { deleteAllDataBlobs, putVersionedBlob, readDataVersion } from "../data/versions.ts";
import { emailOtpEnabled, isTestMode, publicCardOrigin, recoveryCodesCount, sessionSecret, telegramOtpLive, vercelEnv } from "../env.server.ts";
import { photoUrl } from "./photo.ts";
import { clientIp, json, jsonWithCookie, limits, readJson } from "../http.ts";

/** Contact values are single-line text: no control characters (blocks header/vCard/link injection). */
const NO_CONTROL = /^[^\u0000-\u001f\u007f]*$/;
import { nickReissueAllowed, reservedNickKey, type ReservedNick } from "../nick-reserve.ts";
import { generateNick, nickProblem, normalizeNick, parseNickFormat, publicCardPath } from "../nick.ts";
import { getStores } from "../storage/index.ts";
import { isTelegramUserId, telegramFromUserInput, telegramPublicView, sanitizeTelegramRecord } from "../telegram.ts";
import { dataBlobKey, dataVersionKey, nickKey, otpIndexKey, otpKey, sessionKey, sessionsOfKey, type OtpChannel, type UserRecord } from "../user.ts";
import { generateOtpDigits, hashOtp, otpMatches, OTP_MAX_ATTEMPTS, OTP_TTL_MS, type OtpRecord } from "./otp.ts";
import { sendNotice, sendOtp } from "./otp-providers.ts";
import {
  hashLinkToken,
  newLinkToken,
  telegramBotUsername,
  telegramDeepLink,
  telegramLinkKey,
  TELEGRAM_LINK_TTL_MS,
  type TelegramLinkPurpose,
  type TelegramLinkRecord,
} from "./telegram-link.ts";
import { dummyVerifyAuthKey, hashAuthKey, verifyAuthKey } from "./password.ts";
import { createSession, destroySession, readSession, requireUser, revokeAllSessions, type SignInMethod } from "./session.ts";
import { GOOGLE_FRESH_SEC, GOOGLE_STATE_TTL_SEC, exchangeGoogleCode, googleConfig, googleStateKey, googleSubKey, newGoogleRequest, verifyGoogleIdToken, type GooglePurpose, type GoogleState } from "./google.ts";

const kdfSchema = z.object({
  alg: z.literal("argon2id"),
  salt: z.string().min(8),
  memorySize: z.number().int().min(ARGON2_PARAMS.memorySize).max(1_048_576),
  iterations: z.number().int().min(ARGON2_PARAMS.iterations).max(16),
  parallelism: z.number().int().min(1).max(16),
});

const wrappedSchema = z.object({
  iv: z.string().min(8),
  ct: z.string().min(8),
  salt: z.string().min(8).optional(),
});

const authKeySchema = z.string().min(16).max(128);

const signupSchema = z.object({
  nick: z.string().min(3).max(40),
  authKey: authKeySchema,
  recoveryVerifyKey: authKeySchema.optional(),
  kdfPassword: kdfSchema,
  kdfRecovery: kdfSchema.optional(),
  kdfRecoveries: z.array(kdfSchema).min(1).max(10).optional(),
  wrapPassword: wrappedSchema,
  wrapRecovery: wrappedSchema.optional(),
  wrapRecoveries: z.array(wrappedSchema).min(1).max(10).optional(),
  recoveryVerifyKeys: z.array(authKeySchema).min(1).max(10).optional(),
  lang: z.string().optional(),
});

const loginSchema = z.object({
  nick: z.string().min(3),
  authKey: authKeySchema,
  lang: z.string().optional(),
  // channel and dest are ignored if a client still sends them.
});

const otpSchema = z.object({
  otpId: z.string().min(8),
  code: z.string().min(4).max(12),
});
/** Sign-in code; otpId is missing after «Войти через Google» (the pending id is then in the HttpOnly cookie amr_glogin). */
const signInOtpSchema = z.object({
  otpId: z.string().min(8).optional(),
  code: z.string().min(4).max(12),
});

const recoverySchema = z.object({
  nick: z.string().min(3),
  recoveryVerifyKey: authKeySchema,
  authKey: authKeySchema.optional(),
  wrapPassword: wrappedSchema.optional(),
  wrapRecovery: wrappedSchema.optional(),
  recoveryVerifyKeyNew: authKeySchema.optional(),
  wrapRecoveries: z.array(wrappedSchema).max(10).optional(),
  recoveryVerifyKeys: z.array(authKeySchema).max(10).optional(),
  recoveryVerifyKeysNew: z.array(authKeySchema).max(10).optional(),
  kdfPassword: kdfSchema.optional(),
  kdfRecovery: kdfSchema.optional(),
  kdfRecoveries: z.array(kdfSchema).max(10).optional(),
  channel: z.enum(["telegram", "email"]).optional(),
  dest: z.string().min(2).max(200).optional(),
  otpId: z.string().min(8).optional(),
  code: z.string().min(4).max(12).optional(),
  lang: z.string().optional(),
  phase: z.enum(["unlock", "reset", "rebind-start", "rebind-confirm"]).optional(),
});

const kdfRequestSchema = z.object({
  nick: z.string().min(3),
  purpose: z.enum(["login", "recovery"]).optional(),
});

type PendingSignup = {
  kind: "signup";
  user: UserRecord;
  otp?: OtpRecord;
  dest: string;
};

type PendingLogin = {
  kind: "login";
  nick: string;
  otp: OtpRecord;
  /** "google": Google sign-in, finished with the Telegram code (2FA is never skipped). */
  method?: SignInMethod;
};

function fmt() {
  return parseNickFormat();
}

async function nickAvailable(n: string): Promise<boolean> {
  if (await getStores().kv.get(nickKey(n))) return false;
  if (!nickReissueAllowed() && (await getStores().kv.get(reservedNickKey(n)))) return false;
  return true;
}

export async function reserveNick(nick: string, reason: ReservedNick["reason"] = "retired"): Promise<void> {
  if (nickReissueAllowed()) return;
  const rec: ReservedNick = { reservedAt: new Date().toISOString(), reason };
  const key = reservedNickKey(nick);
  const kv = getStores().kv;
  if (await kv.get(key)) return;
  await kv.put(key, JSON.stringify(rec));
}

/** Claim a free nick atomically (DO CAS when configured). */
async function claimNick(nick: string, userJson: string): Promise<boolean> {
  const kv = getStores().kv;
  if (!nickReissueAllowed() && (await kv.get(reservedNickKey(nick)))) return false;
  return kv.compareAndSet(nickKey(nick), null, userJson);
}

async function uniqueNick(preferred?: string): Promise<string | null> {
  const format = fmt();
  if (preferred) {
    const n = normalizeNick(preferred, format);
    if (!n) return null;
    if (!(await nickAvailable(n))) return null;
    return n;
  }
  for (let i = 0; i < 16; i++) {
    const n = generateNick(format);
    if (await nickAvailable(n)) return n;
  }
  return null;
}

function dummyKdf(nick: string, purpose: string): KdfParams {
  const salt = createHmac("sha256", sessionSecret()).update(`kdf:${purpose}:${nick.toLowerCase()}`).digest().subarray(0, 16);
  return {
    alg: "argon2id",
    salt: b64url(new Uint8Array(salt)),
    memorySize: ARGON2_PARAMS.memorySize,
    iterations: ARGON2_PARAMS.iterations,
    parallelism: ARGON2_PARAMS.parallelism,
  };
}

function requireKey(raw: string): Uint8Array | null {
  return decodeAuthKey(raw);
}

function otpPutTtl(): { expirationTtl: number } {
  return { expirationTtl: Math.ceil(OTP_TTL_MS / 1000) + 60 };
}

function recoverySlots(user: UserRecord): { hashes: string[]; wraps: WrappedKey[]; kdfs: KdfParams[] } {
  const hashes = user.recoveryHashes?.length ? user.recoveryHashes : user.recoveryHash ? [user.recoveryHash] : [];
  const wraps = user.wrapRecoveries?.length ? user.wrapRecoveries : user.wrapRecovery ? [user.wrapRecovery] : [];
  const kdfs = user.recoveryKdfs?.length ? user.recoveryKdfs : user.kdf?.recovery ? hashes.map(() => user.kdf.recovery) : [];
  return { hashes, wraps, kdfs };
}

function applyRecoverySlots(user: UserRecord, hashes: string[], wraps: WrappedKey[], kdfs: KdfParams[]): void {
  user.recoveryHashes = hashes;
  user.wrapRecoveries = wraps;
  user.recoveryKdfs = kdfs;
  user.recoveryHash = hashes[0] ?? "";
  user.wrapRecovery = wraps[0] ?? user.wrapRecovery;
  if (kdfs[0]) user.kdf = { ...user.kdf, recovery: kdfs[0] };
}

async function matchRecoveryIndex(user: UserRecord, keys: Uint8Array[]): Promise<{ index: number; used: boolean }> {
  const now = Date.now();
  const slots = recoverySlots(user);
  for (const key of keys) {
    for (let i = 0; i < slots.hashes.length; i++) {
      if (await verifyAuthKey(key, slots.hashes[i]!)) return { index: i, used: false };
    }
  }
  const used = (user.usedRecoveryHashes ?? []).filter((u) => u.until > now);
  for (const key of keys) {
    for (const u of used) {
      if (await verifyAuthKey(key, u.hash)) return { index: -1, used: true };
    }
  }
  return { index: -1, used: false };
}

function readVerifyKeys(body: { recoveryVerifyKey?: string; recoveryVerifyKeys?: string[] }): Uint8Array[] | null {
  const raws = body.recoveryVerifyKeys?.length ? body.recoveryVerifyKeys : body.recoveryVerifyKey ? [body.recoveryVerifyKey] : [];
  const keys: Uint8Array[] = [];
  for (const raw of raws) {
    const k = requireKey(raw);
    if (!k) return null;
    keys.push(k);
  }
  return keys.length ? keys : null;
}


async function readReplacementSlots(data: {
  recoveryVerifyKeysNew?: string[];
  recoveryVerifyKeyNew?: string;
  wrapRecoveries?: unknown[];
  wrapRecovery?: unknown;
  kdfRecoveries?: import("../crypto.ts").KdfParams[];
  kdfRecovery?: import("../crypto.ts").KdfParams;
}): Promise<{ hashes: string[]; wraps: WrappedKey[]; kdfs: import("../crypto.ts").KdfParams[] } | Response> {
  const expected = recoveryCodesCount();
  const keyRaws = data.recoveryVerifyKeysNew?.length
    ? data.recoveryVerifyKeysNew
    : data.recoveryVerifyKeyNew
      ? [data.recoveryVerifyKeyNew]
      : [];
  const wraps = (data.wrapRecoveries?.length ? data.wrapRecoveries : data.wrapRecovery ? [data.wrapRecovery] : []) as WrappedKey[];
  const kdfs = data.kdfRecoveries?.length ? data.kdfRecoveries : data.kdfRecovery ? [data.kdfRecovery] : [];
  if (keyRaws.length !== expected || wraps.length !== expected || kdfs.length !== expected) {
    return json({ error: "invalid", hint: "recovery_codes", recoveryCodes: expected }, 400);
  }
  const hashes: string[] = [];
  for (const raw of keyRaws) {
    const k = requireKey(raw);
    if (!k) return json({ error: "invalid" }, 400);
    hashes.push(await hashAuthKey(k));
  }
  return { hashes, wraps, kdfs };
}

async function dummyLoginWork(nick: string, authKey: Uint8Array | null): Promise<void> {
  const key = authKey ?? new Uint8Array(32);
  await dummyVerifyAuthKey(key, nick || "unknown", sessionSecret());
}

const USED_RECOVERY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function issueOtp(
  request: Request,
  rec: Omit<OtpRecord, "hash" | "exp" | "attempts"> & { dest: string; lang?: string },
): Promise<{ otpId: string; otp: OtpRecord; code: string } | Response> {
  if (rec.channel === "email" && !emailOtpEnabled()) {
    return json({ error: "email_otp_disabled" }, 400);
  }
  const ip = clientIp(request);
  const hit = await limits.otp.take(`otp:${ip}:${rec.nick}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const code = generateOtpDigits();
  const otpId = randomBytes(16).toString("base64url");
  const otp: OtpRecord = {
    nick: rec.nick,
    purpose: rec.purpose,
    channel: rec.channel,
    hash: hashOtp(code),
    exp: Date.now() + OTP_TTL_MS,
    attempts: 0,
  };
  const sent = await sendOtp({ channel: rec.channel, to: rec.dest, code, lang: rec.lang });
  if (!sent.delivered) {
    if (sent.retryAfterMs != null) return json({ error: "rate_limited", retryAfterMs: sent.retryAfterMs }, 429);
    return json({ error: "otp_undelivered" }, 502);
  }
  const idxRaw = await getStores().kv.get(otpIndexKey(rec.nick));
  const ids = idxRaw ? (JSON.parse(idxRaw) as string[]) : [];
  ids.push(otpId);
  await getStores().kv.put(otpIndexKey(rec.nick), JSON.stringify(ids));
  return { otpId, otp, code };
}

async function clearOtpsForNick(nick: string): Promise<void> {
  const kv = getStores().kv;
  const idxRaw = await kv.get(otpIndexKey(nick));
  const ids = new Set(idxRaw ? (JSON.parse(idxRaw) as string[]) : []);
  for (const key of await kv.list("otp:")) {
    const raw = await kv.get(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { nick?: string; otp?: { nick?: string }; user?: { nick?: string } };
      const owner = parsed.nick ?? parsed.otp?.nick ?? parsed.user?.nick;
      if (owner && owner.toLowerCase() === nick.toLowerCase()) ids.add(key.slice("otp:".length));
    } catch {
      /* ignore */
    }
  }
  for (const id of ids) await kv.delete(otpKey(id));
  await kv.delete(otpIndexKey(nick));
}

function verifiedOtpDest(user: UserRecord): { channel: OtpChannel; dest: string } | null {
  if (user.otp.telegram?.verified) {
    const chatId = user.otp.telegram.chatId || user.otp.telegram.id;
    if (chatId && isTelegramUserId(chatId)) return { channel: "telegram", dest: chatId };
    // Local test mode has no bot chat_id; never use a username when the worker is live.
    if (!telegramOtpLive() && user.otp.telegram.username) {
      return { channel: "telegram", dest: user.otp.telegram.username };
    }
  }
  if (emailOtpEnabled() && user.otp.email?.verified && user.otp.email.address) {
    return { channel: "email", dest: user.otp.email.address };
  }
  return null;
}


async function issueTelegramLink(opts: {
  nick: string;
  purpose: TelegramLinkPurpose;
  pendingOtpId?: string;
  lang?: string;
}): Promise<{ token: string; bot: string; deepLink: string }> {
  const token = newLinkToken();
  const hash = await hashLinkToken(token);
  const rec: TelegramLinkRecord = {
    nick: opts.nick,
    purpose: opts.purpose,
    pendingOtpId: opts.pendingOtpId,
    lang: opts.lang,
    exp: Date.now() + TELEGRAM_LINK_TTL_MS,
  };
  await getStores().kv.put(telegramLinkKey(hash), JSON.stringify(rec), {
    expirationTtl: Math.ceil(TELEGRAM_LINK_TTL_MS / 1000) + 60,
  });
  const bot = telegramBotUsername();
  return { token, bot, deepLink: telegramDeepLink(token, bot) };
}

function linkPayload(link: { token: string; bot: string; deepLink: string }) {
  return { linkToken: link.token, bot: `@${link.bot}`, deepLink: link.deepLink, linkExpiresSec: Math.ceil(TELEGRAM_LINK_TTL_MS / 1000) };
}

async function dummyNickProbe(nick: string): Promise<void> {
  const salt = createHmac("sha256", sessionSecret()).update(`nick-probe:${nick.toLowerCase()}`).digest().subarray(0, 16);
  await argon2idMaster("amrid-nick-probe", new Uint8Array(salt), ARGON2_PARAMS);
}

function sessionPayload(user: UserRecord) {
  return {
    nick: user.nick,
    dataId: user.dataId ?? user.nick,
    theme: user.theme,
    appearance: user.appearance,
    contacts: user.contacts,
    wrapPassword: user.wrapPassword,
    kdf: user.kdf,
    dataVersion: user.dataVersion ?? 0,
    cardPath: publicCardPath(user.nick),
    photo: photoUrl(user),
    passwordReset: "recovery_code_only" as const,
    nickChanged: Boolean(user.nickChanged),
    recoveryLeft: (user.recoveryHashes ?? (user.recoveryHash ? [user.recoveryHash] : [])).length,
    googleLinked: Boolean(user.google),
  };
}

export async function handleMeta(request: Request): Promise<Response> {
  const stores = getStores();
  return json({
    testMode: isTestMode(),
    storeKind: stores.kind,
    nickFormat: process.env.AMR_NICK_FORMAT ?? "xxx-xxx",
    nickReissue: false,
    passwordMin: 8,
    passwordReset: "recovery_code_only",
    recoveryCodes: recoveryCodesCount(),
    emailOtp: emailOtpEnabled(),
    ageRequired: false,
    env: vercelEnv(),
    cardOrigin: publicCardOrigin(request),
    telegramBot: telegramOtpLive() ? `@${telegramBotUsername()}` : undefined,
    googleLogin: Boolean(googleConfig()),
  });
}

export async function handleNickCheck(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const hit = await limits.nick.take(`nick-check:${ip}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const url = new URL(request.url);
  const raw = url.searchParams.get("nick") ?? "";
  const n = normalizeNick(raw, fmt());
  if (!n) return json({ ok: false, reason: nickProblem(raw) ?? "format" });
  const free = await nickAvailable(n);
  // Dummy argon2id so a missing nick is not cheaper than a taken one.
  await dummyNickProbe(n);
  return json({ ok: free, nick: n, reason: free ? "free" : "taken" });
}

export async function handleNickSuggest(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const hit = await limits.nick.take(`nick-suggest:${ip}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const nick = await uniqueNick();
  if (!nick) return json({ error: "busy" }, 503);
  return json({ nick });
}

export async function handleKdf(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const hit = await limits.login.take(`kdf:${ip}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const body = kdfRequestSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const purpose = body.data.purpose ?? "login";
  const nick = normalizeNick(body.data.nick, fmt());
  if (!nick) {
    const dummy = dummyKdf(body.data.nick, purpose);
    return json({ kdf: dummy, kdfs: [dummy] });
  }
  const raw = await getStores().kv.get(nickKey(nick));
  if (!raw) {
    const dummy = dummyKdf(nick, purpose);
    return json({ kdf: dummy, kdfs: [dummy] });
  }
  const user = JSON.parse(raw) as UserRecord;
  if (purpose === "recovery") {
    const slots = recoverySlots(user);
    const kdfs = slots.kdfs.length ? slots.kdfs : user.kdf?.recovery ? [user.kdf.recovery] : [];
    const fallback = dummyKdf(nick, purpose);
    return json({ kdf: kdfs[0] ?? fallback, kdfs: kdfs.length ? kdfs : [fallback] });
  }
  return json({ kdf: user.kdf?.password ?? dummyKdf(nick, purpose) });
}

export async function handleSignup(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const hit = await limits.login.take(`signup:${ip}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const body = signupSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const authKey = requireKey(body.data.authKey);
  const verifyRaw = body.data.recoveryVerifyKeys?.length ? body.data.recoveryVerifyKeys : body.data.recoveryVerifyKey ? [body.data.recoveryVerifyKey] : [];
  const wrapList = (body.data.wrapRecoveries?.length ? body.data.wrapRecoveries : body.data.wrapRecovery ? [body.data.wrapRecovery] : []) as WrappedKey[];
  const kdfList = (body.data.kdfRecoveries?.length ? body.data.kdfRecoveries : body.data.kdfRecovery ? [body.data.kdfRecovery] : []) as KdfParams[];
  const expected = recoveryCodesCount();
  if (!authKey || verifyRaw.length !== expected || wrapList.length !== expected || kdfList.length !== expected) {
    return json({ error: "invalid", hint: "recovery_codes", recoveryCodes: expected }, 400);
  }
  const verifyKeys: Uint8Array[] = [];
  for (const raw of verifyRaw) {
    const k = requireKey(raw);
    if (!k) return json({ error: "invalid" }, 400);
    verifyKeys.push(k);
  }
  const nick = await uniqueNick(body.data.nick);
  if (!nick) return json({ error: "nick_taken" }, 409);
  const now = new Date().toISOString();
  const recoveryHashes: string[] = [];
  for (const k of verifyKeys) recoveryHashes.push(await hashAuthKey(k));
  const user: UserRecord = {
    nick,
    dataId: b64url(randomBytes(16)),
    createdAt: now,
    passwordHash: await hashAuthKey(authKey),
    recoveryHash: recoveryHashes[0]!,
    recoveryHashes,
    recoveryKdfs: kdfList,
    kdf: { password: body.data.kdfPassword, recovery: kdfList[0]! },
    // AMR ID registration is independent of Telegram, WhatsApp, and email.
    // External platforms are optional profile links, not account prerequisites.
    otp: {},
    contacts: [],
    theme: "graphite",
    wrapPassword: body.data.wrapPassword as WrappedKey,
    wrapRecovery: wrapList[0]!,
    wrapRecoveries: wrapList,
    appearance: "dark",
    dataVersion: 0,
  };
  if (!(await claimNick(nick, JSON.stringify(user)))) return json({ error: "nick_taken" }, 409);
  await destroySession(request); // a new sign-in never keeps the previous account's session on this device
  const { cookie } = await createSession(nick);
  return jsonWithCookie(sessionPayload(user), cookie);
}

export async function handleLogin(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const body = loginSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const nick = normalizeNick(body.data.nick, fmt());
  const hit = await limits.login.take(`login:${ip}:${(nick ?? body.data.nick).toLowerCase()}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const authKey = requireKey(body.data.authKey);
  const raw = nick ? await getStores().kv.get(nickKey(nick)) : null;
  if (!nick || !authKey || !raw) {
    await dummyLoginWork(nick ?? body.data.nick, authKey);
    return json({ error: "invalid_credentials" }, 401);
  }
  const user = JSON.parse(raw) as UserRecord;
  if (!(await verifyAuthKey(authKey, user.passwordHash))) {
    return json({ error: "invalid_credentials" }, 401);
  }
  // Ignore any client-supplied channel/dest (2FA bypass). OTP goes only to the
  // account's stored, already-verified destination.
  const stored = verifiedOtpDest(user);
  if (!stored) {
    await destroySession(request); // a new sign-in never keeps the previous account's session on this device
    const { cookie } = await createSession(user.nick);
    return jsonWithCookie(sessionPayload(user), cookie);
  }
  const issued = await issueOtp(request, {
    nick,
    purpose: "login",
    channel: stored.channel,
    dest: stored.dest,
    lang: body.data.lang,
  });
  if (issued instanceof Response) return issued;
  const pending: PendingLogin = { kind: "login", nick, otp: issued.otp };
  await getStores().kv.put(otpKey(issued.otpId), JSON.stringify(pending), otpPutTtl());
  const test = isTestMode() ? { testOtp: issued.code } : {};
  return json({ otpId: issued.otpId, nick, channel: stored.channel, ...test });
}

export async function handleOtp(request: Request): Promise<Response> {
  const parsed = signInOtpSchema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const fromCookie = !parsed.data.otpId;
  const otpId = parsed.data.otpId ?? readCookie(request, GOOGLE_LOGIN_COOKIE);
  if (!otpId || !/^[A-Za-z0-9_-]{8,64}$/.test(otpId)) return json({ error: "invalid_code" }, 401);
  const body = { data: { otpId, code: parsed.data.code } };
  const raw = await getStores().kv.get(otpKey(body.data.otpId));
  if (!raw) return json({ error: "invalid_code" }, 401);
  const pending = JSON.parse(raw) as PendingSignup | PendingLogin;
  // The cookie only ever carries a Google sign-in that waits for the Telegram code.
  if (fromCookie && !(pending.kind === "login" && pending.method === "google")) return json({ error: "invalid_code" }, 401);
  // Only sign-up and sign-in codes open a session here; delete / link / channel codes never do.
  if (pending.kind !== "signup" && pending.kind !== "login") return json({ error: "invalid_code" }, 401);
  if (pending.otp && pending.otp.purpose !== pending.kind) return json({ error: "invalid_code" }, 401);
  if (!pending.otp) return json({ error: "telegram_link_required" }, 409);
  if (pending.otp.attempts >= OTP_MAX_ATTEMPTS) {
    await getStores().kv.delete(otpKey(body.data.otpId));
    return json({ error: "too_many_attempts" }, 429);
  }
  if (!otpMatches(body.data.code, pending.otp)) {
    pending.otp.attempts += 1;
    await getStores().kv.put(otpKey(body.data.otpId), JSON.stringify(pending), otpPutTtl());
    return json({ error: "invalid_code" }, 401);
  }
  let user: UserRecord;
  if (pending.kind === "signup") {
    user = pending.user;
    if (pending.otp.channel === "telegram") {
      user.otp.telegram = sanitizeTelegramRecord({
        ...(user.otp.telegram ?? telegramFromUserInput(pending.dest)),
        verified: true,
      });
    } else {
      user.otp.email = { address: pending.dest, verified: true };
    }
    if (!(await claimNick(user.nick, JSON.stringify(user)))) {
      await getStores().kv.delete(otpKey(body.data.otpId));
      return json({ error: "nick_taken" }, 409);
    }
  } else {
    const stored = await getStores().kv.get(nickKey(pending.nick));
    if (!stored) return json({ error: "invalid_code" }, 401);
    user = JSON.parse(stored) as UserRecord;
  }
  await getStores().kv.delete(otpKey(body.data.otpId));
  await destroySession(request); // a new sign-in never keeps the previous account's session on this device
  const method: SignInMethod = pending.kind === "login" && pending.method === "google" ? "google" : "telegram";
  const { cookie } = await createSession(user.nick, method);
  const res = jsonWithCookie({ ...sessionPayload(user), method }, cookie);
  if (method === "google") res.headers.append("Set-Cookie", googleLoginCookie("", 0));
  return res;
}

export async function handleLogout(request: Request): Promise<Response> {
  const cookie = await destroySession(request);
  return jsonWithCookie({ ok: true }, cookie);
}

export async function handleRecovery(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const body = recoverySchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const nick = normalizeNick(body.data.nick, fmt());
  const hit = await limits.login.take(`recovery:${ip}:${(nick ?? "x").toLowerCase()}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const verifyKeys = readVerifyKeys(body.data);
  if (!nick || !verifyKeys) return json({ error: "invalid_credentials" }, 401);
  const raw = await getStores().kv.get(nickKey(nick));
  if (!raw) return json({ error: "invalid_credentials" }, 401);
  const user = JSON.parse(raw) as UserRecord;
  const now = Date.now();
  const used = (user.usedRecoveryHashes ?? []).filter((u) => u.until > now);
  const slots = recoverySlots(user);
  const matched = await matchRecoveryIndex(user, verifyKeys);
  if (matched.used) return json({ error: "recovery_replaced" }, 401);
  if (matched.index < 0) return json({ error: "invalid_credentials" }, 401);
  const matchIndex = matched.index;
  const matchedWrap = slots.wraps[matchIndex] ?? user.wrapRecovery;
  const phase = body.data.phase ?? (body.data.wrapPassword && body.data.authKey ? "reset" : "unlock");

  if (phase === "rebind-start" || phase === "rebind-confirm") {
    return handleRebind(request, body.data, user, matchIndex, now);
  }

  if (phase === "unlock") {
    return json({
      nick: user.nick,
      wrapRecovery: matchedWrap,
      kdf: user.kdf,
      needsPassword: true,
      newRecoveryRequired: true,
      recoveryLeft: slots.hashes.length,
    });
  }
  const newAuth = body.data.authKey ? requireKey(body.data.authKey) : null;
  if (!newAuth || !body.data.wrapPassword || !body.data.kdfPassword) {
    return json({ error: "invalid" }, 400);
  }
  const replacement = await readReplacementSlots(body.data);
  if (replacement instanceof Response) return replacement;
  // Invalidate every previous code (the spent one and the unused remainder).
  const spent = new Set(used.map((u) => u.hash));
  for (const hash of slots.hashes) {
    if (!spent.has(hash)) {
      used.push({ hash, until: now + USED_RECOVERY_TTL_MS });
      spent.add(hash);
    }
  }
  user.usedRecoveryHashes = used;
  applyRecoverySlots(user, replacement.hashes, replacement.wraps, replacement.kdfs);
  user.passwordHash = await hashAuthKey(newAuth);
  user.wrapPassword = body.data.wrapPassword as WrappedKey;
  user.kdf = { password: body.data.kdfPassword, recovery: replacement.kdfs[0] ?? user.kdf.recovery };
  const googleDropped = await dropGoogle(user); // recovery = someone may have had access: unlink Google too
  await getStores().kv.put(nickKey(nick), JSON.stringify(user));
  if (googleDropped) await noticeGoogle(user, "unlinked");
  await revokeAllSessions(user.nick);
  await destroySession(request); // a new sign-in never keeps the previous account's session on this device
  const { cookie } = await createSession(user.nick);
  return jsonWithCookie({ ...sessionPayload(user), wrapRecovery: replacement.wraps[0] ?? matchedWrap, recoveryBurned: true, sessionsRevoked: true, recoveryLeft: recoverySlots(user).hashes.length, newRecoveryIssued: true }, cookie);
}

type PendingRebind = {
  kind: "rebind";
  nick: string;
  otp: OtpRecord;
  dest: string;
  channel: OtpChannel;
  /** Verifier hash of the recovery code being spent — not a slot index. */
  recoveryHash: string;
};

async function handleRebind(
  request: Request,
  data: {
    authKey?: string;
    channel?: "telegram" | "email";
    dest?: string;
    otpId?: string;
    code?: string;
    lang?: string;
    phase?: string;
  },
  user: UserRecord,
  matchIndex: number,
  now: number,
): Promise<Response> {
  if (!data.authKey || !(await requirePassword(user, data.authKey))) {
    return json({ error: "invalid_credentials" }, 401);
  }
  if (data.phase === "rebind-start") {
    const channel = (data.channel ?? "telegram") as OtpChannel;
    if (channel === "email" && !emailOtpEnabled()) return json({ error: "email_otp_disabled" }, 400);
    const dest = (data.dest ?? "").trim();
    if (dest.length < 2) return json({ error: "invalid" }, 400);
    const issued = await issueOtp(request, {
      nick: user.nick,
      purpose: "rebind",
      channel,
      dest,
      lang: data.lang,
    });
    if (issued instanceof Response) return issued;
    const slots = recoverySlots(user);
    const recoveryHash = slots.hashes[matchIndex];
    if (!recoveryHash) return json({ error: "invalid_credentials" }, 401);
    const pending: PendingRebind = { kind: "rebind", nick: user.nick, otp: issued.otp, dest, channel, recoveryHash };
    await getStores().kv.put(otpKey(issued.otpId), JSON.stringify(pending), otpPutTtl());
    const test = isTestMode() ? { testOtp: issued.code } : {};
    return json({ otpId: issued.otpId, channel, ...test });
  }
  if (!data.otpId || !data.code) return json({ error: "reauth_required" }, 400);
  const raw = await getStores().kv.get(otpKey(data.otpId));
  if (!raw) return json({ error: "invalid_code" }, 401);
  const pending = JSON.parse(raw) as PendingRebind;
  if (pending.kind !== "rebind" || pending.nick !== user.nick) return json({ error: "invalid_code" }, 401);
  if (pending.otp.attempts >= OTP_MAX_ATTEMPTS) {
    await getStores().kv.delete(otpKey(data.otpId));
    return json({ error: "too_many_attempts" }, 429);
  }
  if (!otpMatches(data.code, pending.otp)) {
    pending.otp.attempts += 1;
    await getStores().kv.put(otpKey(data.otpId), JSON.stringify(pending), otpPutTtl());
    return json({ error: "invalid_code" }, 401);
  }
  const slots = recoverySlots(user);
  const used = (user.usedRecoveryHashes ?? []).filter((u) => u.until > now);
  const burnAt = slots.hashes.indexOf(pending.recoveryHash);
  if (burnAt < 0) {
    return json({ error: "recovery_replaced" }, 401);
  }
  used.push({ hash: pending.recoveryHash, until: now + USED_RECOVERY_TTL_MS });
  user.usedRecoveryHashes = used;
  applyRecoverySlots(
    user,
    slots.hashes.filter((_, i) => i !== burnAt),
    slots.wraps.filter((_, i) => i !== burnAt),
    slots.kdfs.filter((_, i) => i !== burnAt),
  );
  if (pending.channel === "telegram") user.otp.telegram = telegramFromUserInput(pending.dest, true);
  else user.otp.email = { address: pending.dest, verified: true };
  const googleDropped = await dropGoogle(user); // new 2FA channel after recovery: unlink Google too
  await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  if (googleDropped) await noticeGoogle(user, "unlinked");
  await getStores().kv.delete(otpKey(data.otpId));
  await revokeAllSessions(user.nick);
  const { cookie } = await createSession(user.nick, "telegram");
  return jsonWithCookie({ ...sessionPayload(user), recoveryBurned: true, sessionsRevoked: true, rebound: true, recoveryLeft: recoverySlots(user).hashes.length }, cookie);
}

export async function handleMe(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  return json({
    ...sessionPayload(user),
    otp: {
      telegram: telegramPublicView(user.otp.telegram),
      email: user.otp.email ? { address: user.otp.email.address, verified: user.otp.email.verified } : undefined,
    },
    testMode: isTestMode(),
    storeKind: getStores().kind,
  });
}

const patchSchema = z.object({
  theme: z.enum(["graphite", "minimal", "orbit", "business", "malachite", "blogger", "gamer", "craft", "bakery", "soft", "gothic", "tactic"]).optional(),
  appearance: z.enum(["dark", "light"]).optional(),
  contacts: z
    .array(
      z.object({
        id: z.string().min(1).max(40).regex(/^[\w-]+$/),
        kind: z.enum(["phone", "telegram", "whatsapp", "signal", "discord", "steam", "snapchat", "imo", "instagram", "tiktok", "x", "facebook", "linkedin", "youtube", "boosty", "website", "email", "other"]),
        value: z.string().max(200).regex(NO_CONTROL),
        visible: z.boolean(),
        label: z.string().max(80).optional(),
      }),
    )
    .max(30)
    .optional(),
});

export async function handleMePatch(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = patchSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  if (body.data.theme) user.theme = body.data.theme as CardTheme;
  if (body.data.appearance) user.appearance = body.data.appearance;
  if (body.data.contacts) {
    const previous = new Map(user.contacts.map((c) => [c.id, c]));
    const next: Contact[] = [];
    for (const c of body.data.contacts) {
      if (c.kind === "other" && !isHttpsUrl(c.value)) return json({ error: "invalid", hint: "https_only" }, 400);
      const prev = previous.get(c.id);
      if (!prev) return json({ error: "invalid", hint: "unknown_contact" }, 400);
      next.push({
        ...prev,
        value: c.value,
        visible: c.visible,
        label: c.label,
        kind: c.kind,
        verified: prev.value === c.value && prev.kind === c.kind ? prev.verified : false,
      });
    }
    user.contacts = next;
  }
  await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  return json({ ok: true, contacts: user.contacts, theme: user.theme, appearance: user.appearance });
}

const addContactSchema = z.object({
  kind: z.enum(["phone", "telegram", "whatsapp", "signal", "discord", "steam", "snapchat", "imo", "instagram", "tiktok", "x", "facebook", "linkedin", "youtube", "boosty", "website", "email", "other"]),
  value: z.string().min(1).max(200).regex(NO_CONTROL),
  visible: z.boolean().optional(),
  label: z.string().max(80).optional(),
  lang: z.string().optional(),
});

export async function handleAddContact(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = addContactSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  if ((body.data.kind === "other" || body.data.kind === "youtube") && !isHttpsUrl(body.data.value) && body.data.kind === "other") return json({ error: "invalid", hint: "https_only" }, 400);
  const id = randomBytes(8).toString("base64url");
  const contact: Contact = {
    id,
    kind: body.data.kind,
    value: body.data.value.trim(),
    visible: body.data.visible ?? defaultContactVisible(body.data.kind),
    verified: false,
    label: body.data.label,
  };
  user.contacts.push(contact);
  await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  // Contacts are public links, not authentication factors. No OTP is sent here.
  return json({ contact });
}

export async function handleVerifyContact(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = otpSchema.extend({ contactId: z.string() }).safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const raw = await getStores().kv.get(otpKey(body.data.otpId));
  if (!raw) return json({ error: "invalid_code" }, 401);
  const pending = JSON.parse(raw) as { kind: string; nick: string; contactId: string; otp: OtpRecord };
  if (pending.kind !== "contact" || pending.nick !== user.nick || pending.contactId !== body.data.contactId) {
    return json({ error: "invalid_code" }, 401);
  }
  if (pending.otp.attempts >= OTP_MAX_ATTEMPTS) {
    await getStores().kv.delete(otpKey(body.data.otpId));
    return json({ error: "too_many_attempts" }, 429);
  }
  if (!otpMatches(body.data.code, pending.otp)) {
    pending.otp.attempts += 1;
    if (pending.otp.attempts >= OTP_MAX_ATTEMPTS) {
      await getStores().kv.delete(otpKey(body.data.otpId));
      return json({ error: "too_many_attempts" }, 429);
    }
    await getStores().kv.put(otpKey(body.data.otpId), JSON.stringify(pending), otpPutTtl());
    return json({ error: "invalid_code" }, 401);
  }
  const c = user.contacts.find((x) => x.id === body.data.contactId);
  if (c) c.verified = true;
  // Verifying a contact does not change the 2FA channel. That requires
  // password + a code sent to the current verified destination.
  await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  await getStores().kv.delete(otpKey(body.data.otpId));
  return json({ contact: c });
}

function blobToB64(blob: Uint8Array | null): string | null {
  return blob ? Buffer.from(blob).toString("base64") : null;
}

export async function handleGetData(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const stores = getStores();
  const blob = await stores.blobs.get(dataBlobKey(user.nick));
  const version = await readDataVersion(stores.kv, user.nick);
  return json({ blob: blobToB64(blob), version });
}

export async function handlePutData(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = z.object({ blob: z.string().min(1).max(200_000), version: z.number().int().optional() }).safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const bytes = Buffer.from(body.data.blob, "base64");
  if (bytes.length > 64_000) return json({ error: "too_large" }, 413);
  const ifMatch = request.headers.get("If-Match") ?? (body.data.version != null ? String(body.data.version) : null);
  const stores = getStores();
  const result = await putVersionedBlob({
    kv: stores.kv,
    blobs: stores.blobs,
    nick: user.nick,
    bytes: new Uint8Array(bytes),
    ifMatch,
  });
  if (!result.ok) {
    return json({ error: "conflict", version: result.version, blob: blobToB64(result.blob) }, 409);
  }
  user.dataVersion = result.version;
  await stores.kv.put(nickKey(user.nick), JSON.stringify(user));
  return json({ ok: true, bytes: bytes.length, version: result.version });
}

const stepUpSchema = z.object({
  phase: z.enum(["start", "confirm"]).optional(),
  authKey: authKeySchema,
  otpId: z.string().min(8).optional(),
  code: z.string().min(4).max(12).optional(),
  contactId: z.string().optional(),
  lang: z.string().optional(),
});

type PendingStepUp = {
  kind: "delete" | "otp-channel" | "google-link";
  nick: string;
  otp: import("./otp.ts").OtpRecord;
  contactId?: string;
  authOk: true;
};

async function requirePassword(user: UserRecord, authKeyRaw: string): Promise<boolean> {
  const key = requireKey(authKeyRaw);
  if (!key) {
    await dummyLoginWork(user.nick, null);
    return false;
  }
  return verifyAuthKey(key, user.passwordHash);
}

async function wipeAccount(request: Request, user: UserRecord): Promise<Response> {
  const stores = getStores();
  const nick = user.nick;
  await clearOtpsForNick(nick);
  if (user.google?.sub) await stores.kv.delete(googleSubKey(user.google.sub));
  await revokeAllSessions(nick);
  await deleteAllDataBlobs(stores.blobs, nick);
  if (user.photo) await stores.blobs.delete(user.photo.key);
  await stores.kv.delete(dataVersionKey(nick));
  await stores.kv.delete(nickKey(nick));
  await reserveNick(nick, "retired");
  const cookie = await destroySession(request);
  return jsonWithCookie({ ok: true, deleted: true, nickReserved: true }, cookie);
}

const deleteSchema = z.object({
  phase: z.enum(["start", "confirm"]).optional(),
  authKey: z.string().max(200).optional(),
  otpId: z.string().min(8).max(64).optional(),
  code: z.string().min(4).max(12).optional(),
  lang: z.string().max(8).optional(),
});

/** One active step-up code per account and purpose; a new one may be sent after this pause. */
export const DELETE_RESEND_MS = 60_000;
export const STEP_RESEND_MS = DELETE_RESEND_MS;
type StepPurpose = "delete" | "google-link";
const stepPendingKey = (purpose: StepPurpose, nick: string) => `${purpose === "delete" ? "delpending" : "glpending"}:${nick.toLowerCase()}`;
const deleteGrantKey = (sessionId: string) => `delgrant:${sessionId}`;
const googleLinkGrantKey = (sessionId: string) => `glgrant:${sessionId}`;

/** Send a fresh Telegram code for a step-up action (60 s resend, server rate limit, old code killed, bound to the nick). */
async function stepCodeStart(request: Request, user: UserRecord, purpose: StepPurpose, lang?: string): Promise<Response> {
  const kv = getStores().kv;
  const pointerRaw = await kv.get(stepPendingKey(purpose, user.nick));
  const pointer = pointerRaw ? (JSON.parse(pointerRaw) as { otpId: string; at: number }) : null;
  if (pointer && Date.now() - pointer.at < STEP_RESEND_MS) {
    return json({ proof: "telegram", error: "rate_limited", retryAfterMs: STEP_RESEND_MS - (Date.now() - pointer.at), otpId: pointer.otpId }, 429);
  }
  const stored = verifiedOtpDest(user);
  if (!stored) return json({ proof: "password", error: "no_otp_dest" }, 400);
  const issued = await issueOtp(request, { nick: user.nick, purpose, channel: stored.channel, dest: stored.dest, lang });
  if (issued instanceof Response) return issued;
  if (pointer) await kv.delete(otpKey(pointer.otpId)); // the previous code stops working
  const pending: PendingStepUp = { kind: purpose, nick: user.nick, otp: issued.otp, authOk: true };
  await kv.put(otpKey(issued.otpId), JSON.stringify(pending), otpPutTtl());
  await kv.put(stepPendingKey(purpose, user.nick), JSON.stringify({ otpId: issued.otpId, at: Date.now() }), otpPutTtl());
  const test = isTestMode() ? { testOtp: issued.code } : {};
  return json({ proof: "telegram", otpId: issued.otpId, channel: stored.channel, resendInMs: STEP_RESEND_MS, ...test });
}

/** Check a step-up code; null = ok (code spent). Only a code of this purpose for this nick passes. */
async function stepCodeConfirm(user: UserRecord, purpose: StepPurpose, otpId?: string, code?: string): Promise<Response | null> {
  const kv = getStores().kv;
  if (!otpId || !code) return json({ error: "invalid_code" }, 400);
  const pointerRaw = await kv.get(stepPendingKey(purpose, user.nick));
  const pointer = pointerRaw ? (JSON.parse(pointerRaw) as { otpId: string; at: number }) : null;
  if (!pointer || pointer.otpId !== otpId) return json({ error: "invalid_code" }, 401);
  const raw = await kv.get(otpKey(otpId));
  if (!raw) return json({ error: "invalid_code" }, 401);
  const pending = JSON.parse(raw) as PendingStepUp;
  if (pending.kind !== purpose || pending.otp?.purpose !== purpose || pending.nick !== user.nick || pending.otp.nick !== user.nick) {
    return json({ error: "invalid_code" }, 401);
  }
  if (pending.otp.attempts >= OTP_MAX_ATTEMPTS) {
    await kv.delete(otpKey(otpId));
    await kv.delete(stepPendingKey(purpose, user.nick));
    return json({ error: "too_many_attempts" }, 429);
  }
  if (!otpMatches(code, pending.otp)) {
    pending.otp.attempts += 1;
    await kv.put(otpKey(otpId), JSON.stringify(pending), otpPutTtl());
    return json({ error: "invalid_code" }, 401);
  }
  await kv.delete(otpKey(otpId));
  await kv.delete(stepPendingKey(purpose, user.nick));
  return null;
}

/**
 * «Удалить аккаунт» in ONE step, with the method this session signed in with (Murad, 17.11.2026). No word lists, no chains.
 * - telegram: a fresh code from the bot (purpose=delete, bound to this account; a new one every 60 s replaces the old one).
 * - password (AMR account): the current password.
 * - google: a fresh sign-in at Google (prompt=login, max_age=0, auth_time ≤ 5 min) started with POST /api/auth/google/start.
 */
export async function handleDeleteMe(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const session = await readSession(request);
  if (!session) return json({ error: "unauthorized" }, 401);
  const body = deleteSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const kv = getStores().kv;
  const method = session.method ?? "password";
  const phase = body.data.phase ?? (body.data.otpId || body.data.authKey ? "confirm" : "start");

  if (method === "password") {
    if (phase === "start") return json({ method });
    if (!body.data.authKey || !(await requirePassword(user, body.data.authKey))) return json({ error: "invalid_credentials" }, 401);
    return wipeAccount(request, user);
  }

  if (method === "google") {
    const grantRaw = await kv.get(deleteGrantKey(session.id));
    const grant = grantRaw ? (JSON.parse(grantRaw) as { nick: string; exp: number }) : null;
    const ok = Boolean(grant && grant.nick === user.nick && grant.exp > Date.now());
    if (phase === "start") return json({ method, ready: ok });
    if (!ok) return json({ error: "reauth_required" }, 401);
    await kv.delete(deleteGrantKey(session.id));
    return wipeAccount(request, user);
  }

  if (phase === "start") {
    const r = await stepCodeStart(request, user, "delete", body.data.lang);
    const data = (await r.json()) as Record<string, unknown>;
    return json({ method, ...data }, r.status);
  }
  const bad = await stepCodeConfirm(user, "delete", body.data.otpId, body.data.code);
  if (bad) return bad;
  return wipeAccount(request, user);
}

/* ---------- «Войти через Google» ---------- */

const NOTICE: Record<"linked" | "unlinked", Record<string, string>> = {
  linked: {
    ru: "AMR ID: Google привязан к вашему нику. Если это не вы — войдите и отвяжите Google, смените пароль.",
    ar: "AMR ID: تم ربط Google باسمك. إذا ما كنت أنت — ادخل وافصل Google وغيّر كلمة المرور.",
    uz: "AMR ID: Google nikingizga ulandi. Bu siz bo‘lmasangiz — kirib Googleni uzing va parolni almashtiring.",
    tj: "AMR ID: Google ба ники шумо пайваст шуд. Агар шумо набошед — ворид шуда Google-ро ҷудо кунед ва паролро иваз кунед.",
    en: "AMR ID: Google was linked to your nick. Not you? Sign in, unlink Google and change your password.",
  },
  unlinked: {
    ru: "AMR ID: Google отвязан от вашего ника.",
    ar: "AMR ID: تم فصل Google عن اسمك.",
    uz: "AMR ID: Google nikingizdan uzildi.",
    tj: "AMR ID: Google аз ники шумо ҷудо шуд.",
    en: "AMR ID: Google was unlinked from your nick.",
  },
};
async function noticeGoogle(user: UserRecord, kind: "linked" | "unlinked", lang?: string): Promise<void> {
  const dest = verifiedOtpDest(user);
  if (!dest || dest.channel !== "telegram") return;
  const texts = NOTICE[kind];
  await sendNotice({ channel: dest.channel, to: dest.dest, text: texts[lang ?? "ru"] ?? texts.ru });
}

/** Remove Google from the account (record + index, index only if it still points here). */
async function dropGoogle(user: UserRecord): Promise<boolean> {
  const sub = user.google?.sub;
  if (!sub) return false;
  const kv = getStores().kv;
  const owner = await kv.get(googleSubKey(sub));
  if (owner && owner.toLowerCase() === user.nick.toLowerCase()) await kv.delete(googleSubKey(sub));
  delete user.google;
  return true;
}

const googleProofSchema = z.object({
  action: z.enum(["link", "unlink"]),
  phase: z.enum(["start", "confirm"]),
  authKey: z.string().max(200).optional(),
  otpId: z.string().min(8).max(64).optional(),
  code: z.string().min(4).max(12).optional(),
  lang: z.string().max(8).optional(),
});

/**
 * POST /api/me/google — fresh proof before linking or unlinking Google:
 * the current password, or a Telegram code with purpose=google-link (same 60 s / rate limit rules as delete).
 * link → a 5-minute grant for this session; POST /api/auth/google/start?purpose=link then needs it.
 * unlink → done here.
 */
export async function handleGoogleProof(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const session = await readSession(request);
  if (!session) return json({ error: "unauthorized" }, 401);
  const body = googleProofSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const { action, phase } = body.data;
  if (action === "link" && !googleConfig()) return json({ error: "google_off" }, 404);
  if (action === "unlink" && !user.google) return json({ error: "not_linked" }, 400);
  if (phase === "start") {
    if (!verifiedOtpDest(user)) return json({ proof: "password" });
    return stepCodeStart(request, user, "google-link", body.data.lang);
  }
  if (body.data.authKey) {
    const hit = await limits.login.take(`gproof:${user.nick.toLowerCase()}`);
    if (!hit.ok) return json({ error: "rate_limited" }, 429);
    if (!(await requirePassword(user, body.data.authKey))) return json({ error: "invalid_credentials" }, 401);
  } else {
    const bad = await stepCodeConfirm(user, "google-link", body.data.otpId, body.data.code);
    if (bad) return bad;
  }
  const kv = getStores().kv;
  if (action === "unlink") {
    await dropGoogle(user);
    await kv.put(nickKey(user.nick), JSON.stringify(user));
    await noticeGoogle(user, "unlinked", body.data.lang);
    return json({ ok: true, googleLinked: false });
  }
  await kv.put(googleLinkGrantKey(session.id), JSON.stringify({ nick: user.nick, lang: body.data.lang, exp: Date.now() + 300_000 }), { expirationTtl: 300 });
  return json({ ok: true, next: "google" });
}

const GOOGLE_STATE_COOKIE = "amr_gs";
const GOOGLE_LOGIN_COOKIE = "amr_glogin";
function googleLoginCookie(value: string, maxAge: number): string {
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GOOGLE_LOGIN_COOKIE}=${value}; Path=/api/auth/otp; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function readCookie(request: Request, name: string): string {
  return (request.headers.get("cookie") ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}
function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers({ Location: location, "Cache-Control": "private, no-store" });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers: h });
}
function stateCookie(value: string, maxAge: number): string {
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GOOGLE_STATE_COOKIE}=${value}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
/** Same-site POST only: the Origin header must be this app. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin || origin === "https://self.amrsys.net";
}

/** POST /api/auth/google/start (form: purpose=login|link|delete) → Google. link needs a fresh proof grant; delete needs the session. */
export async function handleGoogleStart(request: Request): Promise<Response> {
  if (request.method !== "POST") return redirect("/?google=failed");
  if (!sameOrigin(request)) return redirect("/?google=failed");
  const cfg = googleConfig();
  if (!cfg) return redirect("/?google=off");
  let raw = "";
  try {
    raw = String((await request.formData()).get("purpose") ?? "");
  } catch {
    raw = "";
  }
  const purpose: GooglePurpose = raw === "link" || raw === "delete" ? raw : "login";
  const st: Omit<GoogleState, "verifier" | "nonce" | "exp"> & { lang?: string } = { purpose };
  if (purpose !== "login") {
    const s = await readSession(request);
    if (!s) return redirect("/?google=signin_first");
    st.sessionId = s.id;
    st.nick = s.nick;
    if (purpose === "link") {
      const kv = getStores().kv;
      const grantRaw = await kv.get(googleLinkGrantKey(s.id));
      const grant = grantRaw ? (JSON.parse(grantRaw) as { nick: string; lang?: string; exp: number }) : null;
      if (!grant || grant.nick !== s.nick || grant.exp < Date.now()) return redirect("/?google=proof_required");
      await kv.delete(googleLinkGrantKey(s.id));
      st.lang = grant.lang;
    }
  }
  const hit = await limits.login.take(`google:${clientIp(request)}`);
  if (!hit.ok) return redirect("/?google=rate_limited");
  const g = newGoogleRequest(purpose, cfg.clientId);
  const rec = { ...st, verifier: g.verifier, nonce: g.nonce, exp: Date.now() + GOOGLE_STATE_TTL_SEC * 1000 };
  await getStores().kv.put(googleStateKey(g.state), JSON.stringify(rec), { expirationTtl: GOOGLE_STATE_TTL_SEC });
  return redirect(g.url, [stateCookie(g.state, GOOGLE_STATE_TTL_SEC)]);
}

/** GET /api/auth/google/callback — exactly https://self.amrsys.net/api/auth/google/callback. */
export async function handleGoogleCallback(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const clear = stateCookie("", 0);
  const back = (q: string, extra: string[] = []) => redirect(`/?google=${q}`, [clear, ...extra]);
  const cfg = googleConfig();
  if (!cfg) return back("off");
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const cookieState = (request.headers.get("cookie") ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(`${GOOGLE_STATE_COOKIE}=`))?.slice(GOOGLE_STATE_COOKIE.length + 1) ?? "";
  if (!state || !code || !/^[A-Za-z0-9_-]{20,64}$/.test(state) || state !== cookieState) return back("failed");
  const kv = getStores().kv;
  const raw = await kv.get(googleStateKey(state));
  await kv.delete(googleStateKey(state)); // one-time
  if (!raw) return back("failed");
  const st = JSON.parse(raw) as GoogleState & { lang?: string };
  if (st.exp < Date.now()) return back("failed");
  const idToken = await exchangeGoogleCode(code, st.verifier, cfg, fetchImpl).catch(() => null);
  if (!idToken) return back("failed");
  const claims = await verifyGoogleIdToken(idToken, { clientId: cfg.clientId, nonce: st.nonce, fetchImpl });
  if (!claims) return back("failed");
  const linkedNick = await kv.get(googleSubKey(claims.sub));

  if (st.purpose === "login") {
    if (!linkedNick) return back("not_linked");
    const userRaw = await kv.get(nickKey(linkedNick));
    if (!userRaw) return back("not_linked");
    const user = JSON.parse(userRaw) as UserRecord;
    if (user.google?.sub !== claims.sub) return back("not_linked");
    // Telegram 2FA is never skipped: with Telegram linked, Google only gets as far as the login code.
    const dest = verifiedOtpDest(user);
    if (dest) {
      const issued = await issueOtp(request, { nick: user.nick, purpose: "login", channel: dest.channel, dest: dest.dest, lang: st.lang });
      if (issued instanceof Response) return back("rate_limited");
      const pending: PendingLogin = { kind: "login", nick: user.nick, otp: issued.otp, method: "google" };
      await kv.put(otpKey(issued.otpId), JSON.stringify(pending), otpPutTtl());
      // The pending id stays in an HttpOnly cookie (not in the URL); /api/auth/otp reads it.
      const test = isTestMode() ? `&t=${issued.code}` : "";
      return redirect(`/?google=otp${test}`, [clear, googleLoginCookie(issued.otpId, Math.floor(OTP_TTL_MS / 1000))]);
    }
    await destroySession(request);
    const { cookie } = await createSession(user.nick, "google");
    return back("ok", [cookie]);
  }

  // link / delete: only for the session that started it
  const s = await readSession(request);
  if (!s || s.id !== st.sessionId || s.nick !== st.nick) return back("signin_first");
  const userRaw = await kv.get(nickKey(s.nick));
  if (!userRaw) return back("failed");
  const user = JSON.parse(userRaw) as UserRecord;

  if (st.purpose === "link") {
    if (linkedNick && linkedNick.toLowerCase() !== user.nick.toLowerCase()) return back("taken");
    // Atomic: one Google = one nick, even with two links racing (Durable Object CAS like claimNick).
    if (!linkedNick && !(await kv.compareAndSet(googleSubKey(claims.sub), null, user.nick))) return back("taken");
    if (user.google?.sub && user.google.sub !== claims.sub) {
      const owner = await kv.get(googleSubKey(user.google.sub));
      if (owner && owner.toLowerCase() === user.nick.toLowerCase()) await kv.delete(googleSubKey(user.google.sub));
    }
    user.google = { sub: claims.sub, linkedAt: new Date().toISOString() }; // PDPL: only the Google id, no email
    await kv.put(nickKey(user.nick), JSON.stringify(user));
    await noticeGoogle(user, "linked", st.lang);
    return back("linked");
  }

  // delete: the same Google account, signed in at Google just now
  const now = Math.floor(Date.now() / 1000);
  if (user.google?.sub !== claims.sub) return back("wrong_account");
  if (!claims.authTime || now - claims.authTime > GOOGLE_FRESH_SEC) return back("not_fresh");
  await kv.put(deleteGrantKey(s.id), JSON.stringify({ nick: user.nick, exp: Date.now() + GOOGLE_FRESH_SEC * 1000 }), { expirationTtl: GOOGLE_FRESH_SEC });
  return redirect("/?delete=google", [clear]);
}

function maskDest(dest: string): string {
  const trimmed = dest.replace(/^@/, "");
  if (trimmed.length <= 3) return "@" + trimmed[0] + "***";
  return "@" + trimmed.slice(0, 2) + "***";
}

export async function handleOtpChannel(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = stepUpSchema.safeParse(await readJson(request));
  if (!body.success || !body.data.contactId) return json({ error: "invalid" }, 400);
  if (!(await requirePassword(user, body.data.authKey))) {
    return json({ error: "invalid_credentials" }, 401);
  }
  const contact = user.contacts.find((c) => c.id === body.data.contactId);
  if (!contact || !contact.verified) return json({ error: "unverified_contact" }, 400);
  if (contact.kind !== "telegram" && !(contact.kind === "email" && emailOtpEnabled())) {
    return json({ error: "channel_unsupported" }, 400);
  }
  const stored = verifiedOtpDest(user);
  if (!stored) return json({ error: "no_otp_dest" }, 400);
  const phase = body.data.phase ?? (body.data.otpId && body.data.code ? "confirm" : "start");
  if (phase === "start") {
    const issued = await issueOtp(request, {
      nick: user.nick,
      purpose: "otp-channel",
      channel: stored.channel,
      dest: stored.dest,
      lang: body.data.lang,
    });
    if (issued instanceof Response) return issued;
    const pending: PendingStepUp = {
      kind: "otp-channel",
      nick: user.nick,
      otp: issued.otp,
      contactId: contact.id,
      authOk: true,
    };
    await getStores().kv.put(otpKey(issued.otpId), JSON.stringify(pending), otpPutTtl());
    const test = isTestMode() ? { testOtp: issued.code } : {};
    return json({
      otpId: issued.otpId,
      channel: stored.channel,
      current: { channel: stored.channel, dest: maskDest(stored.dest) },
      next: { channel: contact.kind, verified: true },
      ...test,
    });
  }
  if (!body.data.otpId || !body.data.code) return json({ error: "reauth_required" }, 400);
  const raw = await getStores().kv.get(otpKey(body.data.otpId));
  if (!raw) return json({ error: "invalid_code" }, 401);
  const pending = JSON.parse(raw) as PendingStepUp;
  if (pending.kind !== "otp-channel" || pending.nick !== user.nick || pending.contactId !== contact.id) {
    return json({ error: "invalid_code" }, 401);
  }
  if (pending.otp.attempts >= OTP_MAX_ATTEMPTS) {
    await getStores().kv.delete(otpKey(body.data.otpId));
    return json({ error: "too_many_attempts" }, 429);
  }
  if (!otpMatches(body.data.code, pending.otp)) {
    pending.otp.attempts += 1;
    await getStores().kv.put(otpKey(body.data.otpId), JSON.stringify(pending), otpPutTtl());
    return json({ error: "invalid_code" }, 401);
  }
  if (contact.kind === "telegram") user.otp.telegram = telegramFromUserInput(contact.value, true);
  else if (contact.kind === "email") user.otp.email = { address: contact.value, verified: true };
  await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  await getStores().kv.delete(otpKey(body.data.otpId));
  return json({ ok: true, otp: { channel: contact.kind } });
}

const nickChangeSchema = z.object({ nick: z.string().min(3), authKey: authKeySchema });

export async function handleChangeNick(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  if (user.nickChanged || user.previousNick) return json({ error: "nick_change_used" }, 409);
  const body = nickChangeSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  if (!(await requirePassword(user, body.data.authKey))) return json({ error: "invalid_credentials" }, 401);
  const next = await uniqueNick(body.data.nick);
  if (!next) return json({ error: "nick_taken" }, 409);
  if (next.toLowerCase() === user.nick.toLowerCase()) return json({ error: "invalid" }, 400);
  const stores = getStores();
  const oldNick = user.nick;
  // Legacy accounts used nick as the encryption AAD. Freeze that value before
  // moving storage keys so a nick change does not make existing blobs undecryptable.
  user.dataId ??= oldNick;
  user.previousNick = oldNick;
  user.nickChanged = true;
  user.nick = next;
  if (!(await claimNick(next, JSON.stringify(user)))) {
    return json({ error: "nick_taken" }, 409);
  }
  if (user.google?.sub) await stores.kv.put(googleSubKey(user.google.sub), next);

  const version = await readDataVersion(stores.kv, oldNick);
  if (version > 0) {
    await stores.kv.put(dataVersionKey(next), String(version));
    const prefix = `user/${oldNick.replace(/^@/, "")}/`;
    for (const key of await stores.blobs.list(prefix)) {
      const blob = await stores.blobs.get(key);
      if (!blob) continue;
      const moved = key.replace(`user/${oldNick.replace(/^@/, "")}/`, `user/${next.replace(/^@/, "")}/`);
      await stores.blobs.put(moved, blob);
      await stores.blobs.delete(key);
    }
    await stores.kv.delete(dataVersionKey(oldNick));
  }
  await stores.kv.delete(nickKey(oldNick));
  await reserveNick(oldNick, "renamed");
  const sessionsRaw = await stores.kv.get(sessionsOfKey(oldNick));
  if (sessionsRaw) {
    const ids = JSON.parse(sessionsRaw) as string[];
    for (const id of ids) {
      const raw = await stores.kv.get(sessionKey(id));
      if (!raw) continue;
      const s = JSON.parse(raw) as { id: string; nick: string; exp: number };
      s.nick = next;
      await stores.kv.put(sessionKey(id), JSON.stringify(s));
    }
    await stores.kv.put(sessionsOfKey(next), sessionsRaw);
    await stores.kv.delete(sessionsOfKey(oldNick));
  }
  return json({ ok: true, nick: next, previousNick: oldNick, nickChanged: true, cardPath: publicCardPath(next) });
}

function listedByOwnerLabel(request: Request): string {
  const url = new URL(request.url);
  const lang = (url.searchParams.get("lang") ?? request.headers.get("accept-language") ?? "en").slice(0, 2).toLowerCase();
  const labels: Record<string, string> = {
    ru: "указан владельцем",
    ar: "ذكره المالك",
    uz: "egasi ko‘rsatgan",
    tj: "соҳиб нишон додааст",
    en: "listed by the owner",
  };
  return labels[lang] ?? labels.en;
}


const replaceRecoverySchema = z.object({
  authKey: authKeySchema,
  recoveryVerifyKeys: z.array(authKeySchema).min(1).max(10),
  wrapRecoveries: z.array(wrappedSchema).min(1).max(10),
  kdfRecoveries: z.array(kdfSchema).min(1).max(10),
});

export async function handleReplaceRecoveryCodes(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = replaceRecoverySchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  if (!(await requirePassword(user, body.data.authKey))) return json({ error: "invalid_credentials" }, 401);
  const expected = recoveryCodesCount();
  if (
    body.data.recoveryVerifyKeys.length !== expected ||
    body.data.wrapRecoveries.length !== expected ||
    body.data.kdfRecoveries.length !== expected
  ) {
    return json({ error: "invalid", hint: "recovery_codes", recoveryCodes: expected }, 400);
  }
  const hashes: string[] = [];
  for (const raw of body.data.recoveryVerifyKeys) {
    const k = requireKey(raw);
    if (!k) return json({ error: "invalid" }, 400);
    hashes.push(await hashAuthKey(k));
  }
  applyRecoverySlots(user, hashes, body.data.wrapRecoveries as WrappedKey[], body.data.kdfRecoveries);
  await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  return json({ ok: true, recoveryLeft: hashes.length });
}

/** Short edge cache for public business cards. 404s are not cached. */
export const PUBLIC_CARD_CACHE = "public, max-age=30, s-maxage=30, stale-while-revalidate=120";

function cardCacheHeaders(cacheControl: string, extra?: HeadersInit): HeadersInit {
  return {
    "Cache-Control": cacheControl,
    "CDN-Cache-Control": cacheControl,
    "Vercel-CDN-Cache-Control": cacheControl,
    ...extra,
  };
}

export async function handlePublicCard(request: Request, nickParam: string): Promise<Response> {
  const nick = normalizeNick(nickParam, fmt());
  if (!nick) return json({ error: "not_found" }, 404, cardCacheHeaders("private, no-store"));
  // Read through the regular store (it goes via the gateway when one is configured),
  // so the card does not depend on the worker's own nick parser.
  const raw = await getStores().kv.get(nickKey(nick));
  if (!raw) return json({ error: "not_found" }, 404, cardCacheHeaders("private, no-store"));
  const user = JSON.parse(raw) as UserRecord;
  const theme = parseCardTheme(new URL(request.url).searchParams.get("t") ?? user.theme);
  const contacts = toPublicContacts(user.contacts, listedByOwnerLabel(request));
  const origin = publicCardOrigin(request);
  return json(
    {
      nick: user.nick,
      theme,
      contacts,
      photo: photoUrl(user),
      url: origin ? `${origin}${publicCardPath(user.nick)}` : publicCardPath(user.nick),
    },
    200,
    cardCacheHeaders(PUBLIC_CARD_CACHE),
  );
}

export { nickAvailable };

export async function handleTelegramLink(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  if (!token) return json({ error: "invalid" }, 400);
  const recRaw = await getStores().kv.get(telegramLinkKey(await hashLinkToken(token)));
  if (!recRaw) return json({ status: "expired" }, 410);
  const rec = JSON.parse(recRaw) as TelegramLinkRecord;
  if (rec.exp <= Date.now()) {
    await getStores().kv.delete(telegramLinkKey(await hashLinkToken(token)));
    return json({ status: "expired" }, 410);
  }
  const bot = telegramBotUsername();
  const deepLink = telegramDeepLink(token, bot);
  if (!rec.linked) return json({ status: "pending", nick: rec.nick, bot: `@${bot}`, deepLink });
  if (rec.purpose === "signup" && rec.pendingOtpId && !rec.claimed) {
    const pendingRaw = await getStores().kv.get(otpKey(rec.pendingOtpId));
    if (!pendingRaw) return json({ status: "expired" }, 410);
    const pending = JSON.parse(pendingRaw) as PendingSignup;
    const user = pending.user;
    if (!user.otp.telegram?.verified || !user.otp.telegram.chatId) {
      return json({ status: "pending", nick: rec.nick, bot: `@${bot}`, deepLink });
    }
    if (!(await claimNick(user.nick, JSON.stringify(user)))) {
      await getStores().kv.delete(otpKey(rec.pendingOtpId));
      return json({ error: "nick_taken" }, 409);
    }
    rec.claimed = true;
    await getStores().kv.put(telegramLinkKey(await hashLinkToken(token)), JSON.stringify(rec), {
      expirationTtl: Math.max(60, Math.ceil((rec.exp - Date.now()) / 1000)),
    });
    await getStores().kv.delete(otpKey(rec.pendingOtpId));
    await destroySession(request); // a new sign-in never keeps the previous account's session on this device
    const { cookie } = await createSession(user.nick, "telegram");
    return jsonWithCookie({ status: "linked", ...sessionPayload(user) }, cookie);
  }
  return json({ status: "linked", nick: rec.nick });
}
