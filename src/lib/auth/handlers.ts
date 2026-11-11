import { randomBytes } from "node:crypto";
import { z } from "zod";
import { toPublicContacts, parseCardTheme, type Contact, type CardTheme } from "../card/visibility.ts";
import { type WrappedKey } from "../crypto.ts";
import { recoveryCodeCompact } from "../crypto.ts";
import { isTestMode, publicCardOrigin, vercelEnv } from "../env.server.ts";
import { clientIp, json, jsonWithCookie, limits, readJson } from "../http.ts";
import {
  generateNick,
  normalizeNick,
  parseNickFormat,
  publicCardPath,
} from "../nick.ts";
import { getStores } from "../storage/index.ts";
import {
  dataBlobKey,
  nickKey,
  otpKey,
  type OtpChannel,
  type UserRecord,
} from "../user.ts";
import { generateOtpDigits, hashOtp, otpMatches, OTP_MAX_ATTEMPTS, OTP_TTL_MS, type OtpRecord } from "./otp.ts";
import { sendOtp } from "./otp-providers.ts";
import { hashOpaque, hashPassword, verifyPassword } from "./password.ts";
import { createSession, destroySession, requireUser } from "./session.ts";

const wrappedSchema = z.object({ salt: z.string().min(8), iv: z.string().min(8), ct: z.string().min(8) });

const signupSchema = z.object({
  nick: z.string().optional(),
  password: z.string().min(8).max(200),
  recoveryCode: z.string().min(8).max(80),
  wrapPassword: wrappedSchema,
  wrapRecovery: wrappedSchema,
  channel: z.enum(["telegram", "email"]),
  dest: z.string().min(2).max(200),
  lang: z.string().optional(),
});

const loginSchema = z.object({
  nick: z.string().min(3),
  password: z.string().min(1).max(200),
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
  recoveryCode: z.string().min(8).max(80),
  password: z.string().min(8).max(200).optional(),
  wrapPassword: wrappedSchema.optional(),
  phase: z.enum(["unlock", "reset"]).optional(),
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

async function uniqueNick(preferred?: string): Promise<string | null> {
  const format = fmt();
  if (preferred) {
    const n = normalizeNick(preferred, format);
    if (!n) return null;
    if (await getStores().kv.get(nickKey(n))) return null;
    return n;
  }
  for (let i = 0; i < 16; i++) {
    const n = generateNick(format);
    if (!(await getStores().kv.get(nickKey(n)))) return n;
  }
  return null;
}

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

export async function handleMeta(request: Request): Promise<Response> {
  const { getStores } = await import("../storage/index.ts");
  const stores = getStores();
  return json({
    testMode: isTestMode(),
    storeKind: stores.kind,
    nickFormat: process.env.AMR_NICK_FORMAT ?? "xxx-xxx",
    env: vercelEnv(),
    cardOrigin: publicCardOrigin(request),
  });
}

export async function handleNickCheck(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = url.searchParams.get("nick") ?? "";
  const n = normalizeNick(raw, fmt());
  if (!n) return json({ ok: false, reason: "format" });
  const taken = Boolean(await getStores().kv.get(nickKey(n)));
  return json({ ok: !taken, nick: n, reason: taken ? "taken" : "free" });
}

export async function handleNickSuggest(): Promise<Response> {
  const nick = await uniqueNick();
  if (!nick) return json({ error: "busy" }, 503);
  return json({ nick });
}

export async function handleSignup(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const hit = limits.login.take(`signup:${ip}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const body = signupSchema.safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const nick = await uniqueNick(body.data.nick);
  if (!nick) return json({ error: "nick_taken" }, 409);
  const now = new Date().toISOString();
  const channel = body.data.channel as OtpChannel;
  const dest = body.data.dest.trim();
  const user: UserRecord = {
    nick,
    createdAt: now,
    passwordHash: await hashPassword(body.data.password),
    recoveryHash: hashOpaque(recoveryCodeCompact(body.data.recoveryCode)),
    otp: channel === "telegram"
      ? { telegram: { username: dest.replace(/^@/, ""), verified: false } }
      : { email: { address: dest, verified: false } },
    contacts: [],
    theme: "graphite",
    wrapPassword: body.data.wrapPassword as WrappedKey,
    wrapRecovery: body.data.wrapRecovery as WrappedKey,
    appearance: "dark",
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
  if (!nick) return json({ error: "invalid_credentials" }, 401);
  const raw = await getStores().kv.get(nickKey(nick));
  if (!raw) return json({ error: "invalid_credentials" }, 401);
  const user = JSON.parse(raw) as UserRecord;
  if (!(await verifyPassword(body.data.password, user.passwordHash))) {
    return json({ error: "invalid_credentials" }, 401);
  }
  let channel: OtpChannel = body.data.channel ?? (user.otp.telegram?.verified ? "telegram" : "email");
  let dest = body.data.dest;
  if (!dest) {
    if (channel === "telegram") dest = user.otp.telegram?.chatId || user.otp.telegram?.username;
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
      user.otp.telegram = { ...(user.otp.telegram ?? {}), verified: true };
    } else {
      user.otp.email = { address: pending.dest, verified: true };
    }
    if (await getStores().kv.get(nickKey(user.nick))) {
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
  return jsonWithCookie(
    {
      nick: user.nick,
      theme: user.theme,
      appearance: user.appearance,
      contacts: user.contacts,
      wrapPassword: user.wrapPassword,
      cardPath: publicCardPath(user.nick),
    },
    cookie,
  );
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
  if (!nick) return json({ error: "invalid_credentials" }, 401);
  const raw = await getStores().kv.get(nickKey(nick));
  if (!raw) return json({ error: "invalid_credentials" }, 401);
  const user = JSON.parse(raw) as UserRecord;
  const compact = recoveryCodeCompact(body.data.recoveryCode);
  if (hashOpaque(compact) !== user.recoveryHash) return json({ error: "invalid_credentials" }, 401);
  const phase = body.data.phase ?? (body.data.wrapPassword && body.data.password ? "reset" : "unlock");
  if (phase === "unlock") {
    return json({ nick: user.nick, wrapRecovery: user.wrapRecovery, needsPassword: true });
  }
  if (!body.data.password || !body.data.wrapPassword) return json({ error: "invalid" }, 400);
  user.passwordHash = await hashPassword(body.data.password);
  user.wrapPassword = body.data.wrapPassword as WrappedKey;
  await getStores().kv.put(nickKey(nick), JSON.stringify(user));
  const { cookie } = await createSession(user.nick);
  return jsonWithCookie(
    {
      nick: user.nick,
      wrapRecovery: user.wrapRecovery,
      wrapPassword: user.wrapPassword,
      theme: user.theme,
      appearance: user.appearance,
      contacts: user.contacts,
      cardPath: publicCardPath(user.nick),
    },
    cookie,
  );
}

export async function handleMe(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  return json({
    nick: user.nick,
    theme: user.theme,
    appearance: user.appearance,
    contacts: user.contacts,
    wrapPassword: user.wrapPassword,
    cardPath: publicCardPath(user.nick),
    otp: {
      telegram: user.otp.telegram ? { username: user.otp.telegram.username, verified: user.otp.telegram.verified } : undefined,
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
    visible: body.data.visible ?? false,
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
  if (c?.kind === "telegram") user.otp.telegram = { username: c.value.replace(/^@/, ""), verified: true };
  if (c?.kind === "email") user.otp.email = { address: c.value, verified: true };
  await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  await getStores().kv.delete(otpKey(body.data.otpId));
  return json({ contact: c });
}

export async function handleGetData(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const blob = await getStores().blobs.get(dataBlobKey(user.nick));
  if (!blob) return json({ blob: null });
  return json({ blob: Buffer.from(blob).toString("base64") });
}

export async function handlePutData(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = z.object({ blob: z.string().min(1).max(200_000) }).safeParse(await readJson(request));
  if (!body.success) return json({ error: "invalid" }, 400);
  const bytes = Buffer.from(body.data.blob, "base64");
  if (bytes.length > 64_000) return json({ error: "too_large" }, 413);
  await getStores().blobs.put(dataBlobKey(user.nick), new Uint8Array(bytes), "application/octet-stream");
  return json({ ok: true, bytes: bytes.length });
}

export async function handlePublicCard(request: Request, nickParam: string): Promise<Response> {
  const nick = normalizeNick(nickParam, fmt());
  if (!nick) return json({ error: "not_found" }, 404);
  const raw = await getStores().kv.get(nickKey(nick));
  if (!raw) return json({ error: "not_found" }, 404);
  const user = JSON.parse(raw) as UserRecord;
  const theme = parseCardTheme(new URL(request.url).searchParams.get("t") ?? user.theme);
  const contacts = toPublicContacts(user.contacts);
  const origin = publicCardOrigin(request);
  return json({
    nick: user.nick,
    theme,
    contacts,
    url: origin ? `${origin}${publicCardPath(user.nick)}` : publicCardPath(user.nick),
  });
}
