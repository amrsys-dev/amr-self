import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { defaultContactVisible, parseCardTheme, toPublicContacts, type Contact, type CardTheme } from "../card/visibility.ts";
import { decodeAuthKey, type KdfParams, type WrappedKey } from "../crypto.ts";
import { ARGON2_PARAMS } from "../crypto.ts";
import { b64url } from "../crypto.ts";
import { putVersionedBlob } from "../data/versions.ts";
import { isTestMode, publicCardOrigin, sessionSecret, vercelEnv } from "../env.server.ts";
import { clientIp, json, jsonWithCookie, limits, readJson } from "../http.ts";
import { nickReissueAllowed, reservedNickKey, type ReservedNick } from "../nick-reserve.ts";
import { generateNick, normalizeNick, parseNickFormat, publicCardPath } from "../nick.ts";
import { getStores } from "../storage/index.ts";
import { telegramFromUserInput, telegramPublicView, sanitizeTelegramRecord } from "../telegram.ts";
import { dataBlobKey, nickKey, otpKey, type OtpChannel, type UserRecord } from "../user.ts";
import { generateOtpDigits, hashOtp, otpMatches, OTP_MAX_ATTEMPTS, OTP_TTL_MS, type OtpRecord } from "./otp.ts";
import { sendOtp } from "./otp-providers.ts";
import { hashAuthKey, verifyAuthKey } from "./password.ts";
import { createSession, destroySession, requireUser } from "./session.ts";

const kdfSchema = z.object({
  alg: z.literal("argon2id"),
  salt: z.string().min(8),
  memorySize: z.number().int().min(8_192).max(1_048_576),
  iterations: z.number().int().min(1).max(16),
  parallelism: z.number().int().min(1).max(16),
});

const wrappedSchema = z.object({
  iv: z.string().min(8),
  ct: z.string().min(8),
  salt: z.string().min(8).optional(),
});

const authKeySchema = z.string().min(16).max(128);

const signupSchema = z.object({
  nick: z.string().optional(),
  authKey: authKeySchema,
  recoveryVerifyKey: authKeySchema,
  kdfPassword: kdfSchema,
  kdfRecovery: kdfSchema,
  wrapPassword: wrappedSchema,
  wrapRecovery: wrappedSchema,
  channel: z.enum(["telegram", "email"]),
  dest: z.string().min(2).max(200),
  lang: z.string().optional(),
});

const loginSchema = z.object({
  nick: z.string().min(3),
  authKey: authKeySchema,
  channel: z.enum(["telegram", "email"]).optional(),
  dest: z.string().min(2).max(200).optional(),
  lang: z.string().optional(),
});

const otpSchema = z.object({
  otpId: z.string().min(8),
  code: z.string().min(4).max(12),
});

const recoverySchema = z.object({
  nick: z.string().min(3),
  recoveryVerifyKey: authKeySchema,
  authKey: authKeySchema.optional(),
  wrapPassword: wrappedSchema.optional(),
  wrapRecovery: wrappedSchema.optional(),
  recoveryVerifyKeyNew: authKeySchema.optional(),
  kdfPassword: kdfSchema.optional(),
  kdfRecovery: kdfSchema.optional(),
  phase: z.enum(["unlock", "reset"]).optional(),
});

const kdfRequestSchema = z.object({
  nick: z.string().min(3),
  purpose: z.enum(["login", "recovery"]).optional(),
});

type PendingSignup = {
  kind: "signup";
  user: UserRecord;
  otp: OtpRecord;
  dest: string;
};

type PendingLogin = {
  kind: "login";
  nick: string;
  otp: OtpRecord;
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
  await getStores().kv.put(reservedNickKey(nick), JSON.stringify(rec));
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

const USED_RECOVERY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function issueOtp(
  request: Request,
  rec: Omit<OtpRecord, "hash" | "exp" | "attempts"> & { dest: string; lang?: string },
): Promise<{ otpId: string; otp: OtpRecord; code: string } | Response> {
  const ip = clientIp(request);
  const hit = limits.otp.take(`otp:${ip}:${rec.nick}`);
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
  await sendOtp({ channel: rec.channel, to: rec.dest, code, lang: rec.lang });
  return { otpId, otp, code };
}

function sessionPayload(user: UserRecord) {
  return {
    nick: user.nick,
    theme: user.theme,
    appearance: user.appearance,
    contacts: user.contacts,
    wrapPassword: user.wrapPassword,
    kdf: user.kdf,
    dataVersion: user.dataVersion ?? 0,
    cardPath: publicCardPath(user.nick),
    passwordReset: "recovery_code_only" as const,
  };
}

export async function handleMeta(request: Request): Promise<Response> {
  const stores = getStores();
  return json({
    testMode: isTestMode(),
    storeKind: stores.kind,
    nickFormat: process.env.AMR_NICK_FORMAT ?? "xxx-xxx",
    nickReissue: nickReissueAllowed(),
    passwordMin: 10,
    passwordReset: "recovery_code_only",
    env: vercelEnv(),
    cardOrigin: publicCardOrigin(request),
  });
}

export async function handleNickCheck(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = url.searchParams.get("nick") ?? "";
  const n = normalizeNick(raw, fmt());
  if (!n) return json({ ok: false, reason: "format" });
  const free = await nickAvailable(n);
  return json({ ok: free, nick: n, reason: free ? "free" : "taken" });
}

export async function handleNickSuggest(): Promise<Response> {
  const nick = await uniqueNick();
  if (!nick) return json({ error: "busy" }, 503);
  return json({ nick });
}

export async function handleKdf(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const hit = limits.login.take(`kdf:${ip}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const body = kdfRequestSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const purpose = body.data.purpose ?? "login";
  const nick = normalizeNick(body.data.nick, fmt());
  if (!nick) return json({ kdf: dummyKdf(body.data.nick, purpose) });
  const raw = await getStores().kv.get(nickKey(nick));
  if (!raw) return json({ kdf: dummyKdf(nick, purpose) });
  const user = JSON.parse(raw) as UserRecord;
  const kdf = purpose === "recovery" ? user.kdf?.recovery : user.kdf?.password;
  return json({ kdf: kdf ?? dummyKdf(nick, purpose) });
}

export async function handleSignup(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const hit = limits.login.take(`signup:${ip}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const body = signupSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const authKey = requireKey(body.data.authKey);
  const recoveryVerifyKey = requireKey(body.data.recoveryVerifyKey);
  if (!authKey || !recoveryVerifyKey) return json({ error: "invalid" }, 400);
  const nick = await uniqueNick(body.data.nick);
  if (!nick) return json({ error: "nick_taken" }, 409);
  const now = new Date().toISOString();
  const channel = body.data.channel as OtpChannel;
  const dest = body.data.dest.trim();
  const user: UserRecord = {
    nick,
    createdAt: now,
    passwordHash: await hashAuthKey(authKey),
    recoveryHash: await hashAuthKey(recoveryVerifyKey),
    kdf: { password: body.data.kdfPassword, recovery: body.data.kdfRecovery },
    otp:
      channel === "telegram"
        ? { telegram: telegramFromUserInput(dest, false) }
        : { email: { address: dest, verified: false } },
    contacts: [],
    theme: "graphite",
    wrapPassword: body.data.wrapPassword as WrappedKey,
    wrapRecovery: body.data.wrapRecovery as WrappedKey,
    appearance: "dark",
    dataVersion: 0,
  };
  const issued = await issueOtp(request, {
    nick,
    purpose: "signup",
    channel,
    dest,
    lang: body.data.lang,
  });
  if (issued instanceof Response) return issued;
  const pending: PendingSignup = { kind: "signup", user, otp: issued.otp, dest };
  await getStores().kv.put(otpKey(issued.otpId), JSON.stringify(pending));
  const test = isTestMode() ? { testOtp: issued.code } : {};
  return json({ otpId: issued.otpId, nick, channel, ...test });
}

export async function handleLogin(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const body = loginSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const nick = normalizeNick(body.data.nick, fmt());
  const hit = limits.login.take(`login:${ip}:${(nick ?? body.data.nick).toLowerCase()}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const authKey = requireKey(body.data.authKey);
  if (!nick || !authKey) return json({ error: "invalid_credentials" }, 401);
  const raw = await getStores().kv.get(nickKey(nick));
  if (!raw) return json({ error: "invalid_credentials" }, 401);
  const user = JSON.parse(raw) as UserRecord;
  if (!(await verifyAuthKey(authKey, user.passwordHash))) {
    return json({ error: "invalid_credentials" }, 401);
  }
  let channel: OtpChannel = body.data.channel ?? (user.otp.telegram?.verified ? "telegram" : "email");
  let dest = body.data.dest;
  if (!dest) {
    if (channel === "telegram") dest = user.otp.telegram?.chatId || user.otp.telegram?.id || user.otp.telegram?.username;
    else dest = user.otp.email?.address;
  }
  if (!dest) {
    if (isTestMode()) dest = "test";
    else return json({ error: "no_otp_dest" }, 400);
  }
  const issued = await issueOtp(request, {
    nick,
    purpose: "login",
    channel,
    dest,
    lang: body.data.lang,
  });
  if (issued instanceof Response) return issued;
  const pending: PendingLogin = { kind: "login", nick, otp: issued.otp };
  await getStores().kv.put(otpKey(issued.otpId), JSON.stringify(pending));
  const test = isTestMode() ? { testOtp: issued.code } : {};
  return json({ otpId: issued.otpId, nick, channel, ...test });
}

export async function handleOtp(request: Request): Promise<Response> {
  const body = otpSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const raw = await getStores().kv.get(otpKey(body.data.otpId));
  if (!raw) return json({ error: "invalid_code" }, 401);
  const pending = JSON.parse(raw) as PendingSignup | PendingLogin;
  if (pending.otp.attempts >= OTP_MAX_ATTEMPTS) {
    await getStores().kv.delete(otpKey(body.data.otpId));
    return json({ error: "too_many_attempts" }, 429);
  }
  if (!otpMatches(body.data.code, pending.otp)) {
    pending.otp.attempts += 1;
    await getStores().kv.put(otpKey(body.data.otpId), JSON.stringify(pending));
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
    if (!(await nickAvailable(user.nick))) {
      await getStores().kv.delete(otpKey(body.data.otpId));
      return json({ error: "nick_taken" }, 409);
    }
    await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  } else {
    const stored = await getStores().kv.get(nickKey(pending.nick));
    if (!stored) return json({ error: "invalid_code" }, 401);
    user = JSON.parse(stored) as UserRecord;
  }
  await getStores().kv.delete(otpKey(body.data.otpId));
  const { cookie } = await createSession(user.nick);
  return jsonWithCookie(sessionPayload(user), cookie);
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
  const hit = limits.login.take(`recovery:${ip}:${(nick ?? "x").toLowerCase()}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const verifyKey = requireKey(body.data.recoveryVerifyKey);
  if (!nick || !verifyKey) return json({ error: "invalid_credentials" }, 401);
  const raw = await getStores().kv.get(nickKey(nick));
  if (!raw) return json({ error: "invalid_credentials" }, 401);
  const user = JSON.parse(raw) as UserRecord;
  const now = Date.now();
  const used = (user.usedRecoveryHashes ?? []).filter((u) => u.until > now);
  if (await verifyAuthKey(verifyKey, user.recoveryHash)) {
    /* current code */
  } else {
    let matchedUsed = false;
    for (const u of used) {
      if (await verifyAuthKey(verifyKey, u.hash)) {
        matchedUsed = true;
        break;
      }
    }
    if (matchedUsed) return json({ error: "recovery_replaced" }, 401);
    return json({ error: "invalid_credentials" }, 401);
  }
  const phase = body.data.phase ?? (body.data.wrapPassword && body.data.authKey ? "reset" : "unlock");
  if (phase === "unlock") {
    return json({
      nick: user.nick,
      wrapRecovery: user.wrapRecovery,
      kdf: user.kdf,
      needsPassword: true,
      newRecoveryRequired: true,
    });
  }
  const newVerify = body.data.recoveryVerifyKeyNew ? requireKey(body.data.recoveryVerifyKeyNew) : null;
  const newAuth = body.data.authKey ? requireKey(body.data.authKey) : null;
  if (!newAuth || !newVerify || !body.data.wrapPassword || !body.data.wrapRecovery || !body.data.kdfPassword || !body.data.kdfRecovery) {
    return json({ error: "invalid", hint: "new_recovery_required" }, 400);
  }
  used.push({ hash: user.recoveryHash, until: now + USED_RECOVERY_TTL_MS });
  user.usedRecoveryHashes = used;
  user.passwordHash = await hashAuthKey(newAuth);
  user.recoveryHash = await hashAuthKey(newVerify);
  user.wrapPassword = body.data.wrapPassword as WrappedKey;
  user.wrapRecovery = body.data.wrapRecovery as WrappedKey;
  user.kdf = { password: body.data.kdfPassword, recovery: body.data.kdfRecovery };
  await getStores().kv.put(nickKey(nick), JSON.stringify(user));
  const { cookie } = await createSession(user.nick);
  return jsonWithCookie({ ...sessionPayload(user), wrapRecovery: user.wrapRecovery, newRecoveryIssued: true }, cookie);
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
  theme: z.enum(["graphite", "gothic", "tactic", "minimal", "orbit", "malachite"]).optional(),
  appearance: z.enum(["dark", "light"]).optional(),
  contacts: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["telegram", "whatsapp", "signal", "discord", "steam", "snapchat", "email", "other"]),
        value: z.string().max(200),
        visible: z.boolean(),
        verified: z.boolean().optional(),
        label: z.string().max(80).optional(),
      }),
    )
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
    user.contacts = body.data.contacts.map((c) => ({
      ...c,
      verified: c.verified ?? false,
    })) as Contact[];
  }
  await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  return json({ ok: true, contacts: user.contacts, theme: user.theme, appearance: user.appearance });
}

const addContactSchema = z.object({
  kind: z.enum(["telegram", "whatsapp", "signal", "discord", "steam", "snapchat", "email", "other"]),
  value: z.string().min(1).max(200),
  visible: z.boolean().optional(),
  label: z.string().max(80).optional(),
  lang: z.string().optional(),
});

export async function handleAddContact(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = addContactSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const id = randomBytes(8).toString("base64url");
  const needsOtp = body.data.kind === "telegram" || body.data.kind === "email";
  const contact: Contact = {
    id,
    kind: body.data.kind,
    value: body.data.value.trim(),
    visible: body.data.visible ?? defaultContactVisible(body.data.kind),
    verified: !needsOtp,
    label: body.data.label,
  };
  user.contacts.push(contact);
  await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  if (!needsOtp) return json({ contact });
  const channel = body.data.kind === "telegram" ? "telegram" : "email";
  const issued = await issueOtp(request, {
    nick: user.nick,
    purpose: "contact",
    channel,
    dest: contact.value,
    lang: body.data.lang,
  });
  if (issued instanceof Response) return issued;
  await getStores().kv.put(
    otpKey(issued.otpId),
    JSON.stringify({ kind: "contact", nick: user.nick, contactId: id, otp: issued.otp }),
  );
  const test = isTestMode() ? { testOtp: issued.code } : {};
  return json({ contact, otpId: issued.otpId, ...test });
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
  if (!otpMatches(body.data.code, pending.otp)) return json({ error: "invalid_code" }, 401);
  const c = user.contacts.find((x) => x.id === body.data.contactId);
  if (c) c.verified = true;
  if (c?.kind === "telegram") user.otp.telegram = telegramFromUserInput(c.value, true);
  if (c?.kind === "email") user.otp.email = { address: c.value, verified: true };
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
  const blob = await getStores().blobs.get(dataBlobKey(user.nick));
  return json({ blob: blobToB64(blob), version: user.dataVersion ?? 0 });
}

export async function handlePutData(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = z.object({ blob: z.string().min(1).max(200_000), version: z.number().int().optional() }).safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const bytes = Buffer.from(body.data.blob, "base64");
  if (bytes.length > 64_000) return json({ error: "too_large" }, 413);
  const ifMatch = request.headers.get("If-Match") ?? (body.data.version != null ? String(body.data.version) : null);
  const result = await putVersionedBlob({
    blobs: getStores().blobs,
    nick: user.nick,
    bytes: new Uint8Array(bytes),
    currentVersion: user.dataVersion ?? 0,
    ifMatch,
  });
  if (!result.ok) {
    return json({ error: "conflict", version: result.version, blob: blobToB64(result.blob) }, 409);
  }
  user.dataVersion = result.version;
  await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  return json({ ok: true, bytes: bytes.length, version: result.version });
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

export async function handlePublicCard(request: Request, nickParam: string): Promise<Response> {
  const nick = normalizeNick(nickParam, fmt());
  if (!nick) return json({ error: "not_found" }, 404);
  const raw = await getStores().kv.get(nickKey(nick));
  if (!raw) return json({ error: "not_found" }, 404);
  const user = JSON.parse(raw) as UserRecord;
  const theme = parseCardTheme(new URL(request.url).searchParams.get("t") ?? user.theme);
  const contacts = toPublicContacts(user.contacts, listedByOwnerLabel(request));
  const origin = publicCardOrigin(request);
  return json({
    nick: user.nick,
    theme,
    contacts,
    url: origin ? `${origin}${publicCardPath(user.nick)}` : publicCardPath(user.nick),
  });
}

export { nickAvailable };
