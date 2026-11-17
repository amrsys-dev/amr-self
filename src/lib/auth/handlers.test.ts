import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { derivePasswordKeys, deriveRecoveryKeys, encodeAuthKey, generateDataKey, generateRecoveryCode, generateRecoveryCodes, wrapDataKey } from "../crypto.ts";
import { resetStoresForTests } from "../storage/index.ts";
import { getStores } from "../storage/index.ts";
import { reservedNickKey as reservedKey } from "../nick-reserve.ts";
import { nickKey } from "../user.ts";
import { ARGON2_PARAMS } from "../crypto.ts";
import { dataBlobKey } from "../user.ts";
import { OTP_MAX_ATTEMPTS } from "./otp.ts";
import { generateKeyPairSync, createSign } from "node:crypto";
import { readSessionId } from "./session.ts";
import { sessionKey } from "../user.ts";
import { GOOGLE_CALLBACK, ageGoogleKeysForTests, googleSubKey, resetGoogleKeysForTests } from "./google.ts";
import { testNotices } from "./otp-providers.ts";
import {
  handleAddContact,
  handleDeleteMe,
  handleKdf,
  handleLogin,
  handleMe,
  handleMePatch,
  handleNickCheck,
  handleOtp,
  handlePutData,
  handleRecovery,
  handleSignup,
  handleChangeNick,
  handleOtpChannel,
  handleReplaceRecoveryCodes,
  handleVerifyContact,
  handlePublicCard,
  handleGoogleStart,
  handleGoogleCallback,
  handleGoogleProof,
  handleMeta,
  DELETE_RESEND_MS,
  PUBLIC_CARD_CACHE,
  reserveNick,
} from "./handlers.ts";

process.env.AMR_STORE = "memory";
process.env.OTP_MODE = "test";
process.env.AMR_NICK_REISSUE = "false";
process.env.AMR_RECOVERY_CODES = "1";
process.env.AMR_OTP_EMAIL = "false";
delete process.env.VERCEL_ENV;

function req(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string>; ip?: string; cookie?: string } = {}): Request {
  const headers = new Headers(opts.headers);
  headers.set("content-type", "application/json");
  headers.set("x-forwarded-for", opts.ip ?? `203.0.113.${Math.floor(Math.random() * 200) + 1}`);
  if (opts.cookie) headers.set("cookie", opts.cookie);
  return new Request(`https://amr-id.test${path}`, {
    method: opts.method ?? "POST",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function json(res: Response): Promise<{ status: number; data: Record<string, unknown>; cookie?: string }> {
  const data = (await res.json()) as Record<string, unknown>;
  const set = res.headers.get("set-cookie") ?? undefined;
  return { status: res.status, data, cookie: set ? set.split(";")[0] : undefined };
}

async function signup(nick: string, password: string, ip?: string) {
  const rec = generateRecoveryCode();
  const dataKey = await generateDataKey();
  const pwd = await derivePasswordKeys(password);
  const recKeys = await deriveRecoveryKeys(rec);
  const wrapPassword = await wrapDataKey(dataKey, pwd.wrapKey);
  const wrapRecovery = await wrapDataKey(dataKey, recKeys.wrapKey);
  const s = await json(
    await handleSignup(
      req("/api/auth/signup", {
        ip,
        body: {
          nick,
          authKey: encodeAuthKey(pwd.authKey),
          recoveryVerifyKey: encodeAuthKey(recKeys.verifyKey),
          kdfPassword: pwd.params,
          kdfRecovery: recKeys.params,
          wrapPassword,
          wrapRecovery,
          kdfRecoveries: [recKeys.params],
          wrapRecoveries: [wrapRecovery],
          recoveryVerifyKeys: [encodeAuthKey(recKeys.verifyKey)],
        },
      }),
    ),
  );
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(s.data.nick, nick.startsWith("@") ? nick : nick.toLowerCase());
  // Legacy-flow tests seed a verified Telegram destination to exercise existing 2FA behavior.
  const storedRaw = await getStores().kv.get(nickKey(s.data.nick as string));
  assert.ok(storedRaw);
  const storedUser = JSON.parse(storedRaw!) as { otp: Record<string, unknown> };
  storedUser.otp.telegram = { username: "omar.public", verified: true };
  await getStores().kv.put(nickKey(s.data.nick as string), JSON.stringify(storedUser));
  return { ...s.data, dataKey, pwd, rec, recKeys, nick: s.data.nick as string, cookie: s.cookie! };

}

async function seedGoogle(nick: string, sub: string) {
  const kv = getStores().kv;
  const u = JSON.parse((await kv.get(nickKey(nick)))!);
  u.google = { sub, linkedAt: new Date().toISOString() };
  await kv.put(nickKey(nick), JSON.stringify(u));
  await kv.put(googleSubKey(sub), nick);
}

describe("auth-key-only login and recovery", () => {
  before(() => {
    process.env.AMR_STORE = "memory";
    process.env.OTP_MODE = "test";
    process.env.AMR_NICK_REISSUE = "false";
    process.env.AMR_RECOVERY_CODES = "1";
    process.env.AMR_OTP_EMAIL = "false";
  });
  beforeEach(() => {
    resetStoresForTests();
  });
  after(() => {
    resetStoresForTests();
  });

  it("rejects signup/login that send a raw password instead of an auth key", async () => {
    const raw = await json(
      await handleSignup(
        req("/api/auth/signup", {
          body: {
            nick: "@AMR-100-100",
            password: "correct-battery-horse",
            recoveryCode: "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG",
            wrapPassword: { iv: "aaaaaaaa", ct: "bbbbbbbb" },
            wrapRecovery: { iv: "aaaaaaaa", ct: "bbbbbbbb" },
            channel: "email",
            dest: "a@b.co",
          },
        }),
      ),
    );
    assert.equal(raw.status, 400);
    const login = await json(
      await handleLogin(req("/api/auth/login", { body: { nick: "@AMR-100-100", password: "correct-battery-horse" } })),
    );
    assert.equal(login.status, 400);
  });

  it("a new sign-in on the same device ends the previous account's session", async () => {
    const a = await signup("@AMR-611-611", "correct-battery-horse");
    const b = await signup("@AMR-622-622", "correct-battery-horse");
    assert.equal((await handleMe(req("/api/me", { method: "GET", cookie: a.cookie }))).status, 200);
    const login = await json(
      await handleLogin(req("/api/auth/login", { cookie: a.cookie, body: { nick: b.nick, authKey: encodeAuthKey(b.pwd.authKey) } })),
    );
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const otp = await json(
      await handleOtp(req("/api/auth/otp", { cookie: a.cookie, body: { otpId: login.data.otpId, code: login.data.testOtp } })),
    );
    assert.equal(otp.status, 200);
    assert.equal((await handleMe(req("/api/me", { method: "GET", cookie: a.cookie }))).status, 401);
    const me = await json(await handleMe(req("/api/me", { method: "GET", cookie: otp.cookie })));
    assert.equal(me.data.nick, b.nick);
  });

  it("logs in with the derived auth key only and stores minimized Telegram fields", async () => {
    const acc = await signup("@AMR-417-283", "correct-battery-horse");
    const stored = JSON.parse((await getStores().kv.get(nickKey(acc.nick)))!) as {
      otp: { telegram: Record<string, unknown> };
      passwordHash: string;
    };
    assert.equal(stored.otp.telegram.username, "omar.public");
    assert.equal("phone" in stored.otp.telegram, false);
    assert.equal("photo" in stored.otp.telegram, false);
    assert.equal("first_name" in stored.otp.telegram, false);
    assert.equal(stored.passwordHash.startsWith("argon2id$"), true);

    const me = await json(await handleMe(req("/api/me", { method: "GET", cookie: acc.cookie })));
    const tg = (me.data.otp as { telegram: Record<string, unknown> }).telegram;
    assert.equal(tg.username, "omar.public");
    assert.equal("phone" in tg, false);
    assert.equal("photo" in tg, false);
    assert.equal("id" in tg, false);

    const kdf = await json(await handleKdf(req("/api/auth/kdf", { body: { nick: acc.nick, purpose: "login" } })));
    assert.equal(kdf.status, 200);
    const login = await json(
      await handleLogin(req("/api/auth/login", { body: { nick: acc.nick, authKey: encodeAuthKey(acc.pwd.authKey) } })),
    );
    assert.equal(login.status, 200, JSON.stringify(login.data));
    assert.ok(login.data.testOtp);
    const otp = await json(
      await handleOtp(req("/api/auth/otp", { body: { otpId: login.data.otpId, code: login.data.testOtp } })),
    );
    assert.equal(otp.status, 200);
  });

  it("rejects a password reset without a fresh recovery set, then replaces the spent set atomically", async () => {
    const acc = await signup("@AMR-200-200", "old-password-ok");
    const unlock = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: acc.nick, recoveryVerifyKey: encodeAuthKey(acc.recKeys.verifyKey), phase: "unlock" },
        }),
      ),
    );
    assert.equal(unlock.status, 200, JSON.stringify(unlock.data));
    assert.equal(unlock.data.newRecoveryRequired, true);

    const newPwd = await derivePasswordKeys("new-password-ok");
    const wrapPassword = await wrapDataKey(acc.dataKey, newPwd.wrapKey);
    const missing = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: acc.nick,
            recoveryVerifyKey: encodeAuthKey(acc.recKeys.verifyKey),
            authKey: encodeAuthKey(newPwd.authKey),
            wrapPassword,
            kdfPassword: newPwd.params,
            phase: "reset",
          },
        }),
      ),
    );
    assert.equal(missing.status, 400, JSON.stringify(missing.data));
    assert.equal(missing.data.hint, "recovery_codes");

    const newRec = await deriveRecoveryKeys(generateRecoveryCode());
    const reset = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: acc.nick,
            recoveryVerifyKey: encodeAuthKey(acc.recKeys.verifyKey),
            authKey: encodeAuthKey(newPwd.authKey),
            wrapPassword,
            wrapRecovery: await wrapDataKey(acc.dataKey, newRec.wrapKey),
            recoveryVerifyKeyNew: encodeAuthKey(newRec.verifyKey),
            kdfPassword: newPwd.params,
            kdfRecovery: newRec.params,
            phase: "reset",
          },
        }),
      ),
    );
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.equal(reset.data.recoveryBurned, true);
    assert.equal(reset.data.newRecoveryIssued, true);
    assert.equal(reset.data.recoveryLeft, 1);

    const oldAgain = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: acc.nick, recoveryVerifyKey: encodeAuthKey(acc.recKeys.verifyKey), phase: "unlock" },
        }),
      ),
    );
    assert.equal(oldAgain.status, 401);
    assert.equal(oldAgain.data.error, "recovery_replaced");

    const fresh = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: acc.nick, recoveryVerifyKey: encodeAuthKey(newRec.verifyKey), phase: "unlock" },
        }),
      ),
    );
    assert.equal(fresh.status, 200, JSON.stringify(fresh.data));
  });

  it("returns 409 and the current blob on a stale If-Match, then accepts a merge write", async () => {
    const acc = await signup("@AMR-300-300", "correct-battery-horse");
    const first = await json(
      await handlePutData(
        req("/api/me/data", {
          method: "PUT",
          cookie: acc.cookie,
          headers: { "If-Match": "0" },
          body: { blob: Buffer.from("v1").toString("base64"), version: 0 },
        }),
      ),
    );
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.version, 1);
    const stale = await json(
      await handlePutData(
        req("/api/me/data", {
          method: "PUT",
          cookie: acc.cookie,
          headers: { "If-Match": "0" },
          body: { blob: Buffer.from("stale").toString("base64"), version: 0 },
        }),
      ),
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.data.error, "conflict");
    assert.equal(stale.data.version, 1);
    assert.equal(Buffer.from(stale.data.blob as string, "base64").toString(), "v1");
    const next = await json(
      await handlePutData(
        req("/api/me/data", {
          method: "PUT",
          cookie: acc.cookie,
          headers: { "If-Match": "1" },
          body: { blob: Buffer.from("v2").toString("base64"), version: 1 },
        }),
      ),
    );
    assert.equal(next.status, 200);
    assert.equal(next.data.version, 2);
  });

  it("adds WhatsApp hidden by default", async () => {
    const acc = await signup("@AMR-400-400", "correct-battery-horse");
    const added = await json(
      await handleAddContact(
        req("/api/me/contacts", {
          cookie: acc.cookie,
          body: { kind: "whatsapp", value: "+966501112233" },
        }),
      ),
    );
    assert.equal(added.status, 200, JSON.stringify(added.data));
    const contact = added.data.contact as { visible: boolean; value: string };
    assert.equal(contact.visible, false);
    assert.equal(contact.value, "+966501112233");
  });

  it("does not reissue a reserved nick unless the config flag is on", async () => {
    resetStoresForTests();
    process.env.AMR_NICK_REISSUE = "false";
    await reserveNick("@AMR-417-283");
    const check = await json(await handleNickCheck(req("/api/nick/check?nick=@AMR-417-283", { method: "GET" })));
    assert.equal(check.data.ok, false);
    assert.equal(check.data.reason, "taken");
    assert.ok(await getStores().kv.get(reservedKey("@AMR-417-283")));
  });

  it("ignores a client-supplied dest and channel on login and sends OTP only to the stored verified destination", async () => {
    const acc = await signup("@AMR-500-500", "correct-battery-horse");
    const login = await json(
      await handleLogin(
        req("/api/auth/login", {
          body: {
            nick: acc.nick,
            authKey: encodeAuthKey(acc.pwd.authKey),
            channel: "email",
            dest: "attacker@evil.example",
          },
        }),
      ),
    );
    assert.equal(login.status, 200, JSON.stringify(login.data));
    assert.equal(login.data.channel, "telegram");
    assert.notEqual(login.data.channel, "email");
    const otp = await json(
      await handleOtp(req("/api/auth/otp", { body: { otpId: login.data.otpId, code: login.data.testOtp } })),
    );
    assert.equal(otp.status, 200, JSON.stringify(otp.data));
    const me = await json(await handleMe(req("/api/me", { method: "GET", cookie: otp.cookie })));
    const tg = (me.data.otp as { telegram: { username?: string } }).telegram;
    assert.equal(tg.username, "omar.public");
    assert.equal((me.data.otp as { email?: unknown }).email, undefined);
  });

  it("rejects KDF parameters weaker than 19 MiB / t=2", async () => {
    const dataKey = await generateDataKey();
    const pwd = await derivePasswordKeys("correct-battery-horse");
    const recKeys = await deriveRecoveryKeys(generateRecoveryCode());
    const weak = { ...pwd.params, memorySize: 8_192, iterations: 1 };
    const res = await json(
      await handleSignup(
        req("/api/auth/signup", {
          body: {
            nick: "@AMR-510-510",
            authKey: encodeAuthKey(pwd.authKey),
            recoveryVerifyKey: encodeAuthKey(recKeys.verifyKey),
            kdfPassword: weak,
            kdfRecovery: recKeys.params,
            wrapPassword: await wrapDataKey(dataKey, pwd.wrapKey),
            wrapRecovery: await wrapDataKey(dataKey, recKeys.wrapKey),
            channel: "telegram",
            dest: "@omar.public",
          },
        }),
      ),
    );
    assert.equal(res.status, 400);
    assert.ok(pwd.params.memorySize >= ARGON2_PARAMS.memorySize);
    assert.ok(pwd.params.iterations >= ARGON2_PARAMS.iterations);
  });

  it("revokes all existing sessions after a recovery password reset", async () => {
    const acc = await signup("@AMR-520-520", "old-password-ok");
    const oldCookie = acc.cookie;
    await seedGoogle(acc.nick, "g-sub-rec");
    testNotices.length = 0;
    const still = await json(await handleMe(req("/api/me", { method: "GET", cookie: oldCookie })));
    assert.equal(still.status, 200);
    const newPwd = await derivePasswordKeys("new-password-ok");
    const newRec = await deriveRecoveryKeys(generateRecoveryCode());
    const reset = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: acc.nick,
            recoveryVerifyKey: encodeAuthKey(acc.recKeys.verifyKey),
            authKey: encodeAuthKey(newPwd.authKey),
            wrapPassword: await wrapDataKey(acc.dataKey, newPwd.wrapKey),
            wrapRecovery: await wrapDataKey(acc.dataKey, newRec.wrapKey),
            recoveryVerifyKeyNew: encodeAuthKey(newRec.verifyKey),
            kdfPassword: newPwd.params,
            kdfRecovery: newRec.params,
            phase: "reset",
          },
        }),
      ),
    );
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.equal(reset.data.sessionsRevoked, true);
    // Recovery unlinks Google: an attacker's linked Google can't survive a reset.
    assert.equal(await getStores().kv.get(googleSubKey("g-sub-rec")), null);
    assert.ok(testNotices.some((n) => n.text.includes("Google отвязан")));
    assert.equal(JSON.parse((await getStores().kv.get(nickKey(acc.nick)))!).google, undefined);
    const dead = await json(await handleMe(req("/api/me", { method: "GET", cookie: oldCookie })));
    assert.equal(dead.status, 401);
    const alive = await json(await handleMe(req("/api/me", { method: "GET", cookie: reset.cookie })));
    assert.equal(alive.status, 200);
  });

  it("does not send verification OTP when adding external contact links", async () => {
    const acc = await signup("@AMR-530-530", "correct-battery-horse");
    const added = await json(
      await handleAddContact(req("/api/me/contacts", { cookie: acc.cookie, body: { kind: "email", value: "a@b.example" } })),
    );
    assert.equal(added.status, 200, JSON.stringify(added.data));
    assert.equal(added.data.otpId, undefined);
    assert.equal(added.data.testOtp, undefined);
    assert.equal((added.data.contact as { verified: boolean }).verified, false);
  });

  it("ignores verified:true from a client PATCH of contacts", async () => {
    const acc = await signup("@AMR-540-540", "correct-battery-horse");
    const added = await json(
      await handleAddContact(req("/api/me/contacts", { cookie: acc.cookie, body: { kind: "email", value: "a@b.example" } })),
    );
    const contact = added.data.contact as { id: string; verified: boolean; kind: string; value: string; visible: boolean };
    assert.equal(contact.verified, false);
    const patched = await json(
      await handleMePatch(
        req("/api/me", {
          method: "PATCH",
          cookie: acc.cookie,
          body: { contacts: [{ ...contact, verified: true, visible: true }] },
        }),
      ),
    );
    assert.equal(patched.status, 200, JSON.stringify(patched.data));
    const contacts = patched.data.contacts as { verified: boolean }[];
    assert.equal(contacts[0]?.verified, false);
  });

  it("rejects kind=other contacts that are not https URLs", async () => {
    const acc = await signup("@AMR-550-550", "correct-battery-horse");
    const http = await json(
      await handleAddContact(req("/api/me/contacts", { cookie: acc.cookie, body: { kind: "other", value: "http://example.com" } })),
    );
    assert.equal(http.status, 400);
    const js = await json(
      await handleAddContact(req("/api/me/contacts", { cookie: acc.cookie, body: { kind: "other", value: "javascript:alert(1)" } })),
    );
    assert.equal(js.status, 400);
    const ok = await json(
      await handleAddContact(req("/api/me/contacts", { cookie: acc.cookie, body: { kind: "other", value: "https://example.com/me" } })),
    );
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
  });

  it("deletes nick data, sessions, OTPs and blobs while reserving the nick", async () => {
    const acc = await signup("@AMR-560-560", "correct-battery-horse");
    await json(
      await handlePutData(
        req("/api/me/data", {
          method: "PUT",
          cookie: acc.cookie,
          headers: { "If-Match": "0" },
          body: { blob: Buffer.from("v1").toString("base64"), version: 0 },
        }),
      ),
    );
    const bare = await json(await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie })));
    assert.equal(bare.status, 400);
    // Signed in with nick + password → one step: the current password.
    const start = await json(await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie, body: { phase: "start" } })));
    assert.equal(start.status, 200, JSON.stringify(start.data));
    assert.equal(start.data.method, "password");
    const bad = await json(await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie, body: { phase: "confirm", authKey: encodeAuthKey(new Uint8Array(32).fill(7)) } })));
    assert.equal(bad.status, 401);
    const noPwd = await json(await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie, body: { phase: "confirm" } })));
    assert.equal(noPwd.status, 401);
    const del = await json(
      await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie, body: { phase: "confirm", authKey: encodeAuthKey(acc.pwd.authKey) } })),
    );
    assert.equal(del.status, 200, JSON.stringify(del.data));
    assert.equal(del.data.deleted, true);
    assert.equal(del.data.nickReserved, true);
    const me = await json(await handleMe(req("/api/me", { method: "GET", cookie: acc.cookie })));
    assert.equal(me.status, 401);
    assert.equal(await getStores().kv.get(nickKey(acc.nick)), null);
    assert.ok(await getStores().kv.get(reservedKey(acc.nick)));
    assert.equal(await getStores().blobs.get(dataBlobKey(acc.nick)), null);
    const check = await json(await handleNickCheck(req(`/api/nick/check?nick=${encodeURIComponent(acc.nick)}`, { method: "GET" })));
    assert.equal(check.data.ok, false);
    assert.equal(check.data.reason, "taken");
  });

  async function asTelegramSession(cookie: string) {
    const id = readSessionId(new Request("https://x.test", { headers: { cookie } }))!;
    const raw = await getStores().kv.get(sessionKey(id));
    await getStores().kv.put(sessionKey(id), JSON.stringify({ ...JSON.parse(raw!), method: "telegram" }));
  }

  it("Telegram session: delete with a fresh delete code only, no password", async () => {
    const acc = await signup("@AMR-571-571", "correct-battery-horse");
    await asTelegramSession(acc.cookie);
    const ip = "198.51.100.71";
    const start = await json(await handleDeleteMe(req("/api/me/delete", { ip, cookie: acc.cookie, body: { phase: "start" } })));
    assert.equal(start.status, 200, JSON.stringify(start.data));
    assert.equal(start.data.method, "telegram");
    assert.equal(start.data.resendInMs, DELETE_RESEND_MS);
    // Second send within 60 s: refused, same code stays valid.
    const again = await json(await handleDeleteMe(req("/api/me/delete", { ip, cookie: acc.cookie, body: { phase: "start" } })));
    assert.equal(again.status, 429);
    assert.equal(again.data.otpId, start.data.otpId);
    const wrongCode = String((Number(start.data.testOtp) + 1) % 1_000_000).padStart(6, "0");
    const bad = await json(await handleDeleteMe(req("/api/me/delete", { ip, cookie: acc.cookie, body: { phase: "confirm", otpId: start.data.otpId, code: wrongCode } })));
    assert.equal(bad.status, 401);
    const del = await json(await handleDeleteMe(req("/api/me/delete", { ip, cookie: acc.cookie, body: { phase: "confirm", otpId: start.data.otpId, code: start.data.testOtp } })));
    assert.equal(del.status, 200, JSON.stringify(del.data));
    assert.equal(del.data.deleted, true);
    assert.equal(await getStores().kv.get(nickKey(acc.nick)), null);
  });

  it("Telegram session: a login code cannot delete the account; a resend kills the old delete code", async () => {
    const acc = await signup("@AMR-572-572", "correct-battery-horse");
    await asTelegramSession(acc.cookie);
    const login = await json(await handleLogin(req("/api/auth/login", { body: { nick: acc.nick, authKey: encodeAuthKey(acc.pwd.authKey) } })));
    assert.equal(login.status, 200, JSON.stringify(login.data));
    assert.ok(login.data.otpId && login.data.testOtp);
    const viaLogin = await json(await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie, body: { phase: "confirm", otpId: login.data.otpId, code: login.data.testOtp } })));
    assert.equal(viaLogin.status, 401);
    // Even if the pointer is aimed at a login code, the purpose check refuses it.
    await getStores().kv.put(`delpending:${acc.nick.toLowerCase()}`, JSON.stringify({ otpId: login.data.otpId, at: Date.now() - DELETE_RESEND_MS - 1 }));
    const aimed = await json(await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie, body: { phase: "confirm", otpId: login.data.otpId, code: login.data.testOtp } })));
    assert.equal(aimed.status, 401);
    await getStores().kv.delete(`delpending:${acc.nick.toLowerCase()}`);
    const first = await json(await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie, body: { phase: "start" } })));
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const ptr = JSON.parse((await getStores().kv.get(`delpending:${acc.nick.toLowerCase()}`))!);
    await getStores().kv.put(`delpending:${acc.nick.toLowerCase()}`, JSON.stringify({ ...ptr, at: Date.now() - DELETE_RESEND_MS - 1 }));
    const second = await json(await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie, body: { phase: "start" } })));
    assert.equal(second.status, 200, JSON.stringify(second.data));
    assert.notEqual(second.data.otpId, first.data.otpId);
    const old = await json(await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie, body: { phase: "confirm", otpId: first.data.otpId, code: first.data.testOtp } })));
    assert.equal(old.status, 401);
    assert.ok(await getStores().kv.get(nickKey(acc.nick)));
  });

  describe("«Войти через Google»", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...(publicKey.export({ format: "jwk" }) as Record<string, string>), kid: "test-kid", alg: "RS256", use: "sig" };
    const CLIENT = "client-123.apps.googleusercontent.com";
    const ORIGIN = "https://amr-id.test";
    function idToken(claims: Record<string, unknown>, kid = "test-kid", key = privateKey) {
      const h = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
      const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(key).toString("base64url");
      return `${h}.${p}.${sig}`;
    }
    let tokenCalls: URLSearchParams[] = [];
    let jwksCalls = 0;
    function fakeGoogle(claims: (nonce: string) => Record<string, unknown>, nonce: () => string, opts: { kid?: string; key?: typeof privateKey; jwks?: () => unknown[] } = {}): typeof fetch {
      return (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) {
          jwksCalls += 1;
          return new Response(JSON.stringify({ keys: opts.jwks ? opts.jwks() : [jwk] }));
        }
        if (url === "https://oauth2.googleapis.com/token") {
          tokenCalls.push(new URLSearchParams(String(init?.body)));
          return new Response(JSON.stringify({ id_token: idToken(claims(nonce()), opts.kid, opts.key) }));
        }
        return new Response("no", { status: 404 });
      }) as typeof fetch;
    }
    const now = () => Math.floor(Date.now() / 1000);
    const base = (nonce: string, sub = "g-sub-1") => ({ iss: "https://accounts.google.com", aud: CLIENT, sub, email: "x@example.com", email_verified: true, iat: now(), exp: now() + 600, auth_time: now(), nonce });

    async function start(purpose: string, cookie?: string, opts: { method?: string; origin?: string | null } = {}) {
      const headers = new Headers({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 1}` });
      if (opts.origin !== null) headers.set("origin", opts.origin ?? ORIGIN);
      if (cookie) headers.set("cookie", cookie);
      const method = opts.method ?? "POST";
      const res = await handleGoogleStart(new Request(`${ORIGIN}/api/auth/google/start`, { method, headers, body: method === "POST" ? `purpose=${purpose}` : undefined }));
      const loc = new URL(res.headers.get("location")!, "https://self.amrsys.net");
      const gs = res.headers.getSetCookie().find((c) => c.startsWith("amr_gs="))?.split(";")[0];
      return { res, loc, gs, state: loc.searchParams.get("state") ?? "", nonce: loc.searchParams.get("nonce") ?? "" };
    }
    function callback(state: string, cookies: (string | undefined)[], f: typeof fetch, code = "auth-code") {
      return handleGoogleCallback(req(`/api/auth/google/callback?state=${state}&code=${code}`, { method: "GET", cookie: cookies.filter(Boolean).join("; ") }), f);
    }
    const sessionCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("amrid_session=") && !c.includes("Max-Age=0"))?.split(";")[0];
    async function proofCall(cookie: string, body: Record<string, unknown>) {
      return json(await handleGoogleProof(req("/api/me/google", { cookie, body })));
    }
    /** Link with the password as proof, then Google. */
    async function linkGoogle(acc: { cookie: string; pwd: { authKey: Uint8Array } }, sub = "g-sub-1") {
      const ok = await proofCall(acc.cookie, { action: "link", phase: "confirm", authKey: encodeAuthKey(acc.pwd.authKey) });
      assert.equal(ok.status, 200, JSON.stringify(ok.data));
      const s = await start("link", acc.cookie);
      return callback(s.state, [acc.cookie, s.gs], fakeGoogle((n) => base(n, sub), () => s.nonce));
    }
    async function dropTelegram(nick: string) {
      const kv = getStores().kv;
      const u = JSON.parse((await kv.get(nickKey(nick)))!);
      delete u.otp.telegram;
      await kv.put(nickKey(nick), JSON.stringify(u));
    }

    beforeEach(() => {
      process.env.GOOGLE_CLIENT_ID = CLIENT;
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";
      resetGoogleKeysForTests();
      tokenCalls = [];
      jwksCalls = 0;
      testNotices.length = 0;
    });
    after(() => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
    });

    it("is off (and the button hidden) without GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET", async () => {
      delete process.env.GOOGLE_CLIENT_SECRET;
      const meta = await json(await handleMeta(req("/api/meta", { method: "GET" })));
      assert.equal(meta.data.googleLogin, false);
      const s = await start("login");
      assert.equal(s.loc.pathname, "/");
      assert.equal(s.loc.searchParams.get("google"), "off");
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";
      assert.equal((await json(await handleMeta(req("/api/meta", { method: "GET" })))).data.googleLogin, true);
    });

    it("start: POST with this Origin only; state + PKCE S256 + nonce, scope openid, exact callback", async () => {
      assert.equal((await start("login", undefined, { method: "GET" })).loc.searchParams.get("google"), "failed");
      assert.equal((await start("login", undefined, { origin: null })).loc.searchParams.get("google"), "failed");
      assert.equal((await start("login", undefined, { origin: "https://evil.example" })).loc.searchParams.get("google"), "failed");
      const s = await start("login");
      assert.equal(s.loc.origin + s.loc.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
      assert.equal(s.loc.searchParams.get("redirect_uri"), "https://self.amrsys.net/api/auth/google/callback");
      assert.equal(GOOGLE_CALLBACK, "https://self.amrsys.net/api/auth/google/callback");
      assert.equal(s.loc.searchParams.get("code_challenge_method"), "S256");
      assert.ok((s.loc.searchParams.get("code_challenge") ?? "").length >= 43);
      assert.ok(s.state.length >= 20 && s.nonce.length >= 20);
      assert.equal(s.gs, `amr_gs=${s.state}`);
      assert.equal(s.loc.searchParams.get("scope"), "openid"); // PDPL: no email scope
      assert.equal((await start("delete")).loc.searchParams.get("google"), "signin_first");
    });

    it("link needs fresh proof: without it → proof_required; with a google-link Telegram code → linked, only sub stored, bot notice", async () => {
      const acc = await signup("@AMR-581-581", "correct-battery-horse");
      const noProof = await start("link", acc.cookie);
      assert.equal(noProof.loc.searchParams.get("google"), "proof_required");
      const st = await proofCall(acc.cookie, { action: "link", phase: "start" });
      assert.equal(st.status, 200, JSON.stringify(st.data));
      assert.equal(st.data.proof, "telegram");
      const again = await proofCall(acc.cookie, { action: "link", phase: "start" });
      assert.equal(again.status, 429); // 60 s resend rule
      const wrong = String((Number(st.data.testOtp) + 1) % 1_000_000).padStart(6, "0");
      assert.equal((await proofCall(acc.cookie, { action: "link", phase: "confirm", otpId: st.data.otpId, code: wrong })).status, 401);
      const ok = await proofCall(acc.cookie, { action: "link", phase: "confirm", otpId: st.data.otpId, code: st.data.testOtp });
      assert.equal(ok.status, 200, JSON.stringify(ok.data));
      const s = await start("link", acc.cookie);
      const linked = await callback(s.state, [acc.cookie, s.gs], fakeGoogle(base, () => s.nonce));
      assert.equal(linked.headers.get("location"), "/?google=linked");
      assert.equal(tokenCalls[0].get("redirect_uri"), GOOGLE_CALLBACK);
      assert.ok((tokenCalls[0].get("code_verifier") ?? "").length >= 43);
      assert.equal(await getStores().kv.get(googleSubKey("g-sub-1")), acc.nick);
      const stored = JSON.parse((await getStores().kv.get(nickKey(acc.nick)))!);
      assert.deepEqual(Object.keys(stored.google).sort(), ["linkedAt", "sub"]);
      assert.ok(!JSON.stringify(stored).includes("x@example.com"));
      assert.ok(testNotices.some((n) => n.text.includes("Google привязан")));
      // The grant is one-time.
      assert.equal((await start("link", acc.cookie)).loc.searchParams.get("google"), "proof_required");
    });

    it("purpose binding: a delete code can't prove a link, a google-link code can't delete or sign in", async () => {
      const acc = await signup("@AMR-585-585", "correct-battery-horse");
      await asTelegramSession(acc.cookie);
      const del = await json(await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie, body: { phase: "start" } })));
      assert.equal(del.status, 200, JSON.stringify(del.data));
      assert.equal((await proofCall(acc.cookie, { action: "link", phase: "confirm", otpId: del.data.otpId, code: del.data.testOtp })).status, 401);
      // handleOtp only opens sessions for sign-up / sign-in codes.
      const viaOtp = await json(await handleOtp(req("/api/auth/otp", { body: { otpId: del.data.otpId, code: del.data.testOtp } })));
      assert.equal(viaOtp.status, 401);
      assert.equal(viaOtp.cookie, undefined);
      const gl = await proofCall(acc.cookie, { action: "link", phase: "start" });
      assert.equal(gl.status, 200, JSON.stringify(gl.data));
      assert.equal((await json(await handleDeleteMe(req("/api/me/delete", { cookie: acc.cookie, body: { phase: "confirm", otpId: gl.data.otpId, code: gl.data.testOtp } })))).status, 401);
      assert.equal((await json(await handleOtp(req("/api/auth/otp", { body: { otpId: gl.data.otpId, code: gl.data.testOtp } })))).status, 401);
      assert.ok(await getStores().kv.get(nickKey(acc.nick)));
    });

    it("unlink needs the same fresh proof, removes the index and sends «Google отвязан»", async () => {
      const acc = await signup("@AMR-586-586", "correct-battery-horse");
      assert.equal((await linkGoogle(acc)).headers.get("location"), "/?google=linked");
      const noProof = await proofCall(acc.cookie, { action: "unlink", phase: "confirm" });
      assert.equal(noProof.status, 400);
      const badPwd = await proofCall(acc.cookie, { action: "unlink", phase: "confirm", authKey: encodeAuthKey(new Uint8Array(32).fill(7)) });
      assert.equal(badPwd.status, 401);
      assert.equal(await getStores().kv.get(googleSubKey("g-sub-1")), acc.nick);
      const st = await proofCall(acc.cookie, { action: "unlink", phase: "start" });
      const ok = await proofCall(acc.cookie, { action: "unlink", phase: "confirm", otpId: st.data.otpId, code: st.data.testOtp });
      assert.equal(ok.status, 200, JSON.stringify(ok.data));
      assert.equal(await getStores().kv.get(googleSubKey("g-sub-1")), null);
      assert.equal(JSON.parse((await getStores().kv.get(nickKey(acc.nick)))!).google, undefined);
      assert.ok(testNotices.some((n) => n.text.includes("Google отвязан")));
    });

    it("Google sign-in never skips Telegram 2FA; without Telegram it signs in directly", async () => {
      const acc = await signup("@AMR-587-587", "correct-battery-horse");
      await linkGoogle(acc);
      const login = await start("login");
      const res = await callback(login.state, [login.gs], fakeGoogle(base, () => login.nonce));
      const loc = new URL(res.headers.get("location")!, ORIGIN);
      assert.equal(loc.pathname, "/");
      assert.equal(loc.searchParams.get("google"), "otp");
      assert.ok(!loc.hash && !loc.search.includes(acc.nick)); // the pending id is not in the URL
      assert.equal(sessionCookie(res), undefined); // no session before the Telegram code
      const pendingCookie = res.headers.getSetCookie().find((c) => c.startsWith("amr_glogin="))!;
      assert.match(pendingCookie, /HttpOnly/);
      assert.match(pendingCookie, /Path=\/api\/auth\/otp/);
      assert.match(pendingCookie, /SameSite=Lax/);
      const pendingId = pendingCookie.split(";")[0];
      assert.ok(!loc.search.includes(pendingId.slice("amr_glogin=".length)));
      // Without the cookie the code alone is useless.
      assert.equal((await json(await handleOtp(req("/api/auth/otp", { body: { code: loc.searchParams.get("t") } })))).status, 401);
      const finRes = await handleOtp(req("/api/auth/otp", { cookie: pendingId, body: { code: loc.searchParams.get("t") } }));
      const fin = await json(finRes.clone());
      assert.equal(fin.status, 200, JSON.stringify(fin.data));
      assert.equal(fin.data.method, "google");
      assert.ok(finRes.headers.getSetCookie().some((c) => c.startsWith("amr_glogin=;") && c.includes("Max-Age=0")));
      const sess = finRes.headers.getSetCookie().find((c) => c.startsWith("amrid_session="))!.split(";")[0];
      assert.equal((await json(await handleMe(req("/api/me", { method: "GET", cookie: sess })))).data.nick, acc.nick);
      // The cookie can't carry an ordinary password-login code.
      const pl = await json(await handleLogin(req("/api/auth/login", { body: { nick: acc.nick, authKey: encodeAuthKey(acc.pwd.authKey) } })));
      assert.equal((await json(await handleOtp(req("/api/auth/otp", { cookie: `amr_glogin=${pl.data.otpId}`, body: { code: pl.data.testOtp } })))).status, 401);
      // An account without Telegram (e.g. Google-first) gets the session right away.
      const other = await signup("@AMR-588-588", "correct-battery-horse");
      await linkGoogle(other, "g-sub-9");
      await dropTelegram(other.nick);
      const l2 = await start("login");
      const r2 = await callback(l2.state, [acc.cookie, l2.gs], fakeGoogle((n) => base(n, "g-sub-9"), () => l2.nonce));
      assert.equal(r2.headers.get("location"), "/?google=ok");
      const c2 = sessionCookie(r2)!;
      assert.equal((await json(await handleMe(req("/api/me", { method: "GET", cookie: c2 })))).data.nick, other.nick);
    });

    it("one Google = one nick, atomically (CAS like claimNick)", async () => {
      const a = await signup("@AMR-589-589", "correct-battery-horse");
      const b = await signup("@AMR-590-590", "correct-battery-horse");
      await linkGoogle(a);
      assert.equal((await linkGoogle(b)).headers.get("location"), "/?google=taken");
      // Race: the read says free, but another link won in between → CAS refuses.
      const c = await signup("@AMR-591-591", "correct-battery-horse");
      await proofCall(c.cookie, { action: "link", phase: "confirm", authKey: encodeAuthKey(c.pwd.authKey) });
      const s = await start("link", c.cookie);
      const kv = getStores().kv;
      const realGet = kv.get.bind(kv);
      kv.get = (async (key: string) => (key === googleSubKey("g-sub-race") ? null : realGet(key))) as typeof kv.get;
      await kv.put(googleSubKey("g-sub-race"), a.nick);
      try {
        const r = await callback(s.state, [c.cookie, s.gs], fakeGoogle((n) => base(n, "g-sub-race"), () => s.nonce));
        assert.equal(r.headers.get("location"), "/?google=taken");
      } finally {
        kv.get = realGet;
      }
      assert.equal(await kv.get(googleSubKey("g-sub-race")), a.nick);
      assert.equal(JSON.parse((await kv.get(nickKey(c.nick)))!).google, undefined);
    });

    it("callback rejects a bad state, a missing state cookie, replay, wrong nonce, aud, iss, signature and expiry", async () => {
      const acc = await signup("@AMR-583-583", "correct-battery-horse");
      await linkGoogle(acc);
      await dropTelegram(acc.nick);
      const loc = async (r: Response) => r.headers.get("location");
      const bad = async (mut: (n: string) => Record<string, unknown>, opts: { kid?: string; key?: typeof privateKey } = {}) => {
        const s = await start("login");
        return loc(await callback(s.state, [s.gs], fakeGoogle(mut, () => s.nonce, opts)));
      };
      const s1 = await start("login");
      assert.equal(await loc(await callback(s1.state, [], fakeGoogle(base, () => s1.nonce))), "/?google=failed");
      assert.equal(await loc(await callback("x".repeat(32), [`amr_gs=${"x".repeat(32)}`], fakeGoogle(base, () => s1.nonce))), "/?google=failed");
      assert.equal(await loc(await callback(s1.state, [s1.gs], fakeGoogle(base, () => s1.nonce))), "/?google=ok");
      assert.equal(await loc(await callback(s1.state, [s1.gs], fakeGoogle(base, () => s1.nonce))), "/?google=failed"); // replay
      assert.equal(await bad(() => base("other-nonce")), "/?google=failed");
      assert.equal(await bad((n) => ({ ...base(n), aud: "someone-else" })), "/?google=failed");
      assert.equal(await bad((n) => ({ ...base(n), iss: "https://evil.example" })), "/?google=failed");
      assert.equal(await bad((n) => ({ ...base(n), exp: now() - 120 })), "/?google=failed");
      assert.equal(await bad(base, { kid: "unknown-kid" }), "/?google=failed");
      const { privateKey: otherKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
      assert.equal(await bad(base, { key: otherKey }), "/?google=failed");
      assert.equal(await bad((n) => base(n, "g-sub-unknown")), "/?google=not_linked");
    });

    it("refetches Google keys once on an unknown kid (key rotation), not on every request", async () => {
      const acc = await signup("@AMR-592-592", "correct-battery-horse");
      await linkGoogle(acc);
      await dropTelegram(acc.nick);
      // Cached keys are old and lack the new kid; Google now publishes it.
      let rotated = false;
      const keys = () => (rotated ? [jwk] : [{ ...jwk, kid: "old-kid" }]);
      resetGoogleKeysForTests();
      const s0 = await start("login");
      await callback(s0.state, [s0.gs], fakeGoogle(base, () => s0.nonce, { jwks: keys })); // fills the cache with old keys
      ageGoogleKeysForTests(60_000);
      rotated = true;
      jwksCalls = 0;
      const s1 = await start("login");
      const r1 = await callback(s1.state, [s1.gs], fakeGoogle(base, () => s1.nonce, { jwks: keys }));
      assert.equal(r1.headers.get("location"), "/?google=ok");
      assert.equal(jwksCalls, 1);
      // A garbage kid right after a fetch does not hammer Google.
      jwksCalls = 0;
      const s2 = await start("login");
      await callback(s2.state, [s2.gs], fakeGoogle(base, () => s2.nonce, { jwks: keys, kid: "garbage" }));
      assert.equal(jwksCalls, 0);
    });

    it("Google session: delete after a fresh Google sign-in only (prompt=login, max_age=0, auth_time checked)", async () => {
      const acc = await signup("@AMR-584-584", "correct-battery-horse");
      await linkGoogle(acc);
      await dropTelegram(acc.nick);
      const login = await start("login");
      const res = await callback(login.state, [acc.cookie, login.gs], fakeGoogle(base, () => login.nonce));
      const cookie = sessionCookie(res)!;
      const st = await json(await handleDeleteMe(req("/api/me/delete", { cookie, body: { phase: "start" } })));
      assert.equal(st.data.method, "google");
      assert.equal(st.data.ready, false);
      const early = await json(await handleDeleteMe(req("/api/me/delete", { cookie, body: { phase: "confirm" } })));
      assert.equal(early.status, 401);
      assert.equal(early.data.error, "reauth_required");
      const stale = await start("delete", cookie);
      assert.equal(stale.loc.searchParams.get("prompt"), "login");
      assert.equal(stale.loc.searchParams.get("max_age"), "0");
      const r1 = await callback(stale.state, [cookie, stale.gs], fakeGoogle((n) => ({ ...base(n), auth_time: now() - 600 }), () => stale.nonce));
      assert.equal(r1.headers.get("location"), "/?google=not_fresh");
      const wrong = await start("delete", cookie);
      const r2 = await callback(wrong.state, [cookie, wrong.gs], fakeGoogle((n) => base(n, "g-sub-2"), () => wrong.nonce));
      assert.equal(r2.headers.get("location"), "/?google=wrong_account");
      const fresh = await start("delete", cookie);
      const r3 = await callback(fresh.state, [cookie, fresh.gs], fakeGoogle(base, () => fresh.nonce));
      assert.equal(r3.headers.get("location"), "/?delete=google");
      const ready = await json(await handleDeleteMe(req("/api/me/delete", { cookie, body: { phase: "start" } })));
      assert.equal(ready.data.ready, true);
      const del = await json(await handleDeleteMe(req("/api/me/delete", { cookie, body: { phase: "confirm" } })));
      assert.equal(del.status, 200, JSON.stringify(del.data));
      assert.equal(await getStores().kv.get(nickKey(acc.nick)), null);
      assert.equal(await getStores().kv.get(googleSubKey("g-sub-1")), null);
    });
  });

  it("returns a deterministic dummy KDF and a dummy-timed 401 for an unknown nick", async () => {
    const a = await json(await handleKdf(req("/api/auth/kdf", { body: { nick: "@AMR-999-999", purpose: "login" } })));
    const b = await json(await handleKdf(req("/api/auth/kdf", { body: { nick: "@AMR-999-999", purpose: "login" } })));
    assert.equal(a.status, 200);
    assert.equal((a.data.kdf as { alg: string }).alg, "argon2id");
    assert.equal((a.data.kdf as { salt: string }).salt, (b.data.kdf as { salt: string }).salt);
    const other = await json(await handleKdf(req("/api/auth/kdf", { body: { nick: "@AMR-998-998", purpose: "login" } })));
    assert.notEqual((a.data.kdf as { salt: string }).salt, (other.data.kdf as { salt: string }).salt);
    const pwd = await derivePasswordKeys("correct-battery-horse", undefined, { memorySize: 19456, iterations: 2, parallelism: 1, hashLength: 32 });
    const login = await json(
      await handleLogin(req("/api/auth/login", { body: { nick: "@AMR-999-999", authKey: encodeAuthKey(pwd.authKey) } })),
    );
    assert.equal(login.status, 401);
    assert.equal(login.data.error, "invalid_credentials");
  });

  it("adds external contact links without sending OTP and clears verification after edits", async () => {
    const acc = await signup("@AMR-541-541", "correct-battery-horse");
    const added = await json(
      await handleAddContact(req("/api/me/contacts", { cookie: acc.cookie, body: { kind: "email", value: "a@b.example" } })),
    );
    assert.equal(added.status, 200, JSON.stringify(added.data));
    assert.equal(added.data.otpId, undefined);
    const contact = added.data.contact as { id: string; verified: boolean; kind: string; value: string; visible: boolean };
    assert.equal(contact.verified, false);
    const raw = await getStores().kv.get(nickKey(acc.nick));
    assert.ok(raw);
    const user = JSON.parse(raw!) as { contacts: { id: string; verified: boolean }[] };
    user.contacts.find((c) => c.id === contact.id)!.verified = true;
    await getStores().kv.put(nickKey(acc.nick), JSON.stringify(user));
    const patched = await json(
      await handleMePatch(
        req("/api/me", {
          method: "PATCH",
          cookie: acc.cookie,
          body: { contacts: [{ id: contact.id, kind: "email", value: "new@b.example", visible: true }] },
        }),
      ),
    );
    assert.equal(patched.status, 200, JSON.stringify(patched.data));
    assert.equal((patched.data.contacts as { verified: boolean; value: string }[])[0]?.verified, false);
    assert.equal((patched.data.contacts as { value: string }[])[0]?.value, "new@b.example");
  });

  it("does not switch the 2FA channel on contact verify; change needs password and a code from the old channel", async () => {
    const acc = await signup("@AMR-570-570", "correct-battery-horse");
    const added = await json(
      await handleAddContact(req("/api/me/contacts", { cookie: acc.cookie, body: { kind: "telegram", value: "@new.channel" } })),
    );
    assert.equal(added.status, 200, JSON.stringify(added.data));
    const contact = added.data.contact as { id: string };
    assert.equal(added.data.otpId, undefined);
    const rawUser = await getStores().kv.get(nickKey(acc.nick));
    assert.ok(rawUser);
    const userRecord = JSON.parse(rawUser!) as { contacts: { id: string; verified: boolean }[] };
    userRecord.contacts.find((c) => c.id === contact.id)!.verified = true;
    await getStores().kv.put(nickKey(acc.nick), JSON.stringify(userRecord));
    const me = await json(await handleMe(req("/api/me", { method: "GET", cookie: acc.cookie })));
    assert.equal(((me.data.otp as { telegram: { username?: string } }).telegram.username), "omar.public");
    const noPwd = await json(
      await handleOtpChannel(req("/api/me/otp-channel", { cookie: acc.cookie, body: { contactId: contact.id, authKey: "x" } })),
    );
    assert.equal(noPwd.status, 400);
    const start = await json(
      await handleOtpChannel(
        req("/api/me/otp-channel", { cookie: acc.cookie, body: { phase: "start", contactId: contact.id, authKey: encodeAuthKey(acc.pwd.authKey) } }),
      ),
    );
    assert.equal(start.status, 200, JSON.stringify(start.data));
    assert.equal(start.data.channel, "telegram");
    const confirm = await json(
      await handleOtpChannel(
        req("/api/me/otp-channel", {
          cookie: acc.cookie,
          body: {
            phase: "confirm",
            contactId: contact.id,
            authKey: encodeAuthKey(acc.pwd.authKey),
            otpId: start.data.otpId,
            code: start.data.testOtp,
          },
        }),
      ),
    );
    assert.equal(confirm.status, 200, JSON.stringify(confirm.data));
    const after = await json(await handleMe(req("/api/me", { method: "GET", cookie: acc.cookie })));
    assert.equal(((after.data.otp as { telegram: { username?: string } }).telegram.username), "new.channel");
  });

  it("creates an AMR ID without Telegram or email OTP", async () => {
    const pwd = await derivePasswordKeys("correct-battery-horse");
    const rec = await deriveRecoveryKeys(generateRecoveryCode());
    const dataKey = await generateDataKey();
    const noAge = await json(
      await handleSignup(
        req("/api/auth/signup", {
          body: {
            nick: "Name",
            authKey: encodeAuthKey(pwd.authKey),
            recoveryVerifyKey: encodeAuthKey(rec.verifyKey),
            kdfPassword: pwd.params,
            kdfRecovery: rec.params,
            wrapPassword: await wrapDataKey(dataKey, pwd.wrapKey),
            wrapRecovery: await wrapDataKey(dataKey, rec.wrapKey),
            channel: "telegram",
            dest: "@omar.public",
          },
        }),
      ),
    );
    assert.equal(noAge.status, 200, JSON.stringify(noAge.data));
    assert.equal(noAge.data.nick, "name.amr");
    assert.ok(noAge.cookie);
    const directLogin = await json(await handleLogin(req("/api/auth/login", { body: { nick: noAge.data.nick, authKey: encodeAuthKey(pwd.authKey) } })));
    assert.equal(directLogin.status, 200, JSON.stringify(directLogin.data));
    assert.ok(directLogin.cookie);
    assert.equal(directLogin.data.otpId, undefined);
    const email = await json(
      await handleSignup(
        req("/api/auth/signup", {
          body: {
            nick: "@AMR-581-581",
            authKey: encodeAuthKey(pwd.authKey),
            recoveryVerifyKey: encodeAuthKey(rec.verifyKey),
            kdfPassword: pwd.params,
            kdfRecovery: rec.params,
            wrapPassword: await wrapDataKey(dataKey, pwd.wrapKey),
            wrapRecovery: await wrapDataKey(dataKey, rec.wrapKey),
            channel: "email",
            dest: "a@b.example",
            ageConfirmed: true,
          },
        }),
      ),
    );
    assert.equal(email.status, 200, JSON.stringify(email.data));
  });

  it("allows a nick change exactly once, only with the password, and never reissues the old nick", async () => {
    const acc = await signup("@AMR-590-590", "correct-battery-horse");
    const noPwd = await json(await handleChangeNick(req("/api/me/nick", { cookie: acc.cookie, body: { nick: "@AMR-591-591" } })));
    assert.equal(noPwd.status, 400);
    const first = await json(
      await handleChangeNick(
        req("/api/me/nick", { cookie: acc.cookie, body: { nick: "@AMR-591-591", authKey: encodeAuthKey(acc.pwd.authKey) } }),
      ),
    );
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.nickChanged, true);
    const second = await json(
      await handleChangeNick(
        req("/api/me/nick", { cookie: acc.cookie, body: { nick: "@AMR-592-592", authKey: encodeAuthKey(acc.pwd.authKey) } }),
      ),
    );
    assert.equal(second.status, 409);
    const check = await json(await handleNickCheck(req(`/api/nick/check?nick=${encodeURIComponent(acc.nick)}`, { method: "GET" })));
    assert.equal(check.data.ok, false);
    assert.equal(check.data.reason, "taken");
  });

  it("binds a new 2FA channel with password + one recovery code, then revokes sessions and burns the code", async () => {
    const acc = await signup("@AMR-600-600", "correct-battery-horse");
    const oldCookie = acc.cookie;
    await seedGoogle(acc.nick, "g-sub-rebind");
    testNotices.length = 0;
    const start = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: acc.nick,
            recoveryVerifyKey: encodeAuthKey(acc.recKeys.verifyKey),
            authKey: encodeAuthKey(acc.pwd.authKey),
            phase: "rebind-start",
            channel: "telegram",
            dest: "@new.otp",
          },
        }),
      ),
    );
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const confirm = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: acc.nick,
            recoveryVerifyKey: encodeAuthKey(acc.recKeys.verifyKey),
            authKey: encodeAuthKey(acc.pwd.authKey),
            phase: "rebind-confirm",
            otpId: start.data.otpId,
            code: start.data.testOtp,
          },
        }),
      ),
    );
    assert.equal(confirm.status, 200, JSON.stringify(confirm.data));
    assert.equal(confirm.data.rebound, true);
    assert.equal(await getStores().kv.get(googleSubKey("g-sub-rebind")), null);
    assert.ok(testNotices.some((n) => n.text.includes("Google отвязан")));
    assert.equal(JSON.parse((await getStores().kv.get(nickKey(acc.nick)))!).google, undefined);
    assert.equal(confirm.data.sessionsRevoked, true);
    assert.equal(confirm.data.recoveryBurned, true);
    const dead = await json(await handleMe(req("/api/me", { method: "GET", cookie: oldCookie })));
    assert.equal(dead.status, 401);
    const me = await json(await handleMe(req("/api/me", { method: "GET", cookie: confirm.cookie })));
    assert.equal(me.status, 200);
    assert.equal((me.data.otp as { telegram: { username?: string } }).telegram.username, "new.otp");
    const reused = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: acc.nick, recoveryVerifyKey: encodeAuthKey(acc.recKeys.verifyKey), phase: "unlock" },
        }),
      ),
    );
    assert.equal(reused.status, 401);
    assert.equal(reused.data.error, "recovery_replaced");
  });

  it("stores a verifier hash and a wrap per client-generated recovery code with its own salt", async () => {
    const prev = process.env.AMR_RECOVERY_CODES;
    process.env.AMR_RECOVERY_CODES = "2";
    const password = "correct-battery-horse";
    const dataKey = await generateDataKey();
    const pwd = await derivePasswordKeys(password);
    const recs = [generateRecoveryCode(), generateRecoveryCode()];
    const recKeys = [await deriveRecoveryKeys(recs[0]!), await deriveRecoveryKeys(recs[1]!)];
    assert.notEqual(recKeys[0]!.params.salt, recKeys[1]!.params.salt);
    const wraps = [await wrapDataKey(dataKey, recKeys[0]!.wrapKey), await wrapDataKey(dataKey, recKeys[1]!.wrapKey)];
    const s = await json(
      await handleSignup(
        req("/api/auth/signup", {
          body: {
            nick: "@AMR-610-610",
            authKey: encodeAuthKey(pwd.authKey),
            recoveryVerifyKeys: recKeys.map((k) => encodeAuthKey(k.verifyKey)),
            kdfPassword: pwd.params,
            kdfRecoveries: recKeys.map((k) => k.params),
            wrapPassword: await wrapDataKey(dataKey, pwd.wrapKey),
            wrapRecoveries: wraps,
            channel: "telegram",
            dest: "@omar.public",
            ageConfirmed: true,
          },
        }),
      ),
    );
    assert.equal(s.status, 200, JSON.stringify(s.data));
    const kdf = await json(await handleKdf(req("/api/auth/kdf", { body: { nick: s.data.nick, purpose: "recovery" } })));
    assert.equal(kdf.status, 200);
    const kdfs = kdf.data.kdfs as { salt: string }[];
    assert.equal(kdfs.length, 2);
    assert.notEqual(kdfs[0]?.salt, kdfs[1]?.salt);
    const first = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: s.data.nick, recoveryVerifyKey: encodeAuthKey(recKeys[0]!.verifyKey), phase: "unlock" },
        }),
      ),
    );
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const withSecond = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: s.data.nick, recoveryVerifyKey: encodeAuthKey(recKeys[1]!.verifyKey), phase: "unlock" },
        }),
      ),
    );
    assert.equal(withSecond.status, 200, JSON.stringify(withSecond.data));
    process.env.AMR_RECOVERY_CODES = prev ?? "1";
  });

  it("unlocks and resets with recovery code #2 after trying every KDF salt, and invalidates the old set", async () => {
    const prev = process.env.AMR_RECOVERY_CODES;
    process.env.AMR_RECOVERY_CODES = "2";
    const password = "correct-battery-horse";
    const dataKey = await generateDataKey();
    const pwd = await derivePasswordKeys(password);
    const recs = generateRecoveryCodes(2);
    const recKeys = [await deriveRecoveryKeys(recs[0]!), await deriveRecoveryKeys(recs[1]!)];
    const wraps = [await wrapDataKey(dataKey, recKeys[0]!.wrapKey), await wrapDataKey(dataKey, recKeys[1]!.wrapKey)];
    const s = await json(
      await handleSignup(
        req("/api/auth/signup", {
          body: {
            nick: "@AMR-611-611",
            authKey: encodeAuthKey(pwd.authKey),
            recoveryVerifyKeys: recKeys.map((k) => encodeAuthKey(k.verifyKey)),
            kdfPassword: pwd.params,
            kdfRecoveries: recKeys.map((k) => k.params),
            wrapPassword: await wrapDataKey(dataKey, pwd.wrapKey),
            wrapRecoveries: wraps,
            channel: "telegram",
            dest: "@omar.public",
            ageConfirmed: true,
          },
        }),
      ),
    );
    assert.equal(s.status, 200, JSON.stringify(s.data));
    const kdf = await json(await handleKdf(req("/api/auth/kdf", { body: { nick: s.data.nick, purpose: "recovery" } })));
    const kdfs = kdf.data.kdfs as { salt: string }[];
    assert.equal(kdfs.length, 2);
    const unlock = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: s.data.nick,
            recoveryVerifyKey: encodeAuthKey(recKeys[1]!.verifyKey),
            recoveryVerifyKeys: recKeys.map((k) => encodeAuthKey(k.verifyKey)),
            phase: "unlock",
          },
        }),
      ),
    );
    assert.equal(unlock.status, 200, JSON.stringify(unlock.data));
    const newPwd = await derivePasswordKeys("new-password-ok");
    const fresh = [await deriveRecoveryKeys(generateRecoveryCode()), await deriveRecoveryKeys(generateRecoveryCode())];
    const reset = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: s.data.nick,
            recoveryVerifyKey: encodeAuthKey(recKeys[1]!.verifyKey),
            authKey: encodeAuthKey(newPwd.authKey),
            wrapPassword: await wrapDataKey(dataKey, newPwd.wrapKey),
            wrapRecoveries: [await wrapDataKey(dataKey, fresh[0]!.wrapKey), await wrapDataKey(dataKey, fresh[1]!.wrapKey)],
            recoveryVerifyKeysNew: fresh.map((k) => encodeAuthKey(k.verifyKey)),
            kdfPassword: newPwd.params,
            kdfRecoveries: fresh.map((k) => k.params),
            phase: "reset",
          },
        }),
      ),
    );
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.equal(reset.data.recoveryLeft, 2);
    assert.equal(reset.data.newRecoveryIssued, true);
    for (const k of recKeys) {
      const old = await json(
        await handleRecovery(
          req("/api/auth/recovery", {
            body: { nick: s.data.nick, recoveryVerifyKey: encodeAuthKey(k.verifyKey), phase: "unlock" },
          }),
        ),
      );
      assert.equal(old.status, 401);
      assert.equal(old.data.error, "recovery_replaced");
    }
    const ok = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: s.data.nick, recoveryVerifyKey: encodeAuthKey(fresh[1]!.verifyKey), phase: "unlock" },
        }),
      ),
    );
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    process.env.AMR_RECOVERY_CODES = prev ?? "1";
  });

  it("rebind burns the recovery code by verifier hash, not by slot index", async () => {
    const prev = process.env.AMR_RECOVERY_CODES;
    process.env.AMR_RECOVERY_CODES = "3";
    const password = "correct-battery-horse";
    const dataKey = await generateDataKey();
    const pwd = await derivePasswordKeys(password);
    const recs = generateRecoveryCodes(3);
    const recKeys = [await deriveRecoveryKeys(recs[0]!), await deriveRecoveryKeys(recs[1]!), await deriveRecoveryKeys(recs[2]!)];
    const wraps = [
      await wrapDataKey(dataKey, recKeys[0]!.wrapKey),
      await wrapDataKey(dataKey, recKeys[1]!.wrapKey),
      await wrapDataKey(dataKey, recKeys[2]!.wrapKey),
    ];
    const s = await json(
      await handleSignup(
        req("/api/auth/signup", {
          body: {
            nick: "@AMR-612-612",
            authKey: encodeAuthKey(pwd.authKey),
            recoveryVerifyKeys: recKeys.map((k) => encodeAuthKey(k.verifyKey)),
            kdfPassword: pwd.params,
            kdfRecoveries: recKeys.map((k) => k.params),
            wrapPassword: await wrapDataKey(dataKey, pwd.wrapKey),
            wrapRecoveries: wraps,
            channel: "telegram",
            dest: "@omar.public",
            ageConfirmed: true,
          },
        }),
      ),
    );
    assert.equal(s.status, 200, JSON.stringify(s.data));
    const start = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: s.data.nick,
            recoveryVerifyKey: encodeAuthKey(recKeys[1]!.verifyKey),
            authKey: encodeAuthKey(pwd.authKey),
            phase: "rebind-start",
            channel: "telegram",
            dest: "@new.otp",
          },
        }),
      ),
    );
    assert.equal(start.status, 200, JSON.stringify(start.data));
    // Drop code #1 so index 1 would now point at code #3. Burning must still spend code #2.
    const raw = await getStores().kv.get(nickKey(s.data.nick as string));
    assert.ok(raw);
    const user = JSON.parse(raw!) as { recoveryHashes: string[]; wrapRecoveries: unknown[]; recoveryKdfs: unknown[]; recoveryHash: string; wrapRecovery: unknown; kdf: { recovery: unknown } };
    user.recoveryHashes = user.recoveryHashes.slice(1);
    user.wrapRecoveries = user.wrapRecoveries.slice(1);
    user.recoveryKdfs = user.recoveryKdfs.slice(1);
    user.recoveryHash = user.recoveryHashes[0]!;
    user.wrapRecovery = user.wrapRecoveries[0];
    user.kdf = { ...user.kdf, recovery: user.recoveryKdfs[0] };
    await getStores().kv.put(nickKey(s.data.nick as string), JSON.stringify(user));
    const confirm = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: s.data.nick,
            recoveryVerifyKey: encodeAuthKey(recKeys[1]!.verifyKey),
            authKey: encodeAuthKey(pwd.authKey),
            phase: "rebind-confirm",
            otpId: start.data.otpId,
            code: start.data.testOtp,
          },
        }),
      ),
    );
    assert.equal(confirm.status, 200, JSON.stringify(confirm.data));
    assert.equal(confirm.data.rebound, true);
    const burned = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: s.data.nick, recoveryVerifyKey: encodeAuthKey(recKeys[1]!.verifyKey), phase: "unlock" },
        }),
      ),
    );
    assert.equal(burned.status, 401);
    assert.equal(burned.data.error, "recovery_replaced");
    const leftover = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: s.data.nick, recoveryVerifyKey: encodeAuthKey(recKeys[2]!.verifyKey), phase: "unlock" },
        }),
      ),
    );
    assert.equal(leftover.status, 200, JSON.stringify(leftover.data));
    process.env.AMR_RECOVERY_CODES = prev ?? "1";
  });


});

describe("public business card cache", () => {
  beforeEach(() => {
    resetStoresForTests();
    process.env.AMR_STORE = "memory";
    process.env.OTP_MODE = "test";
  });

  it("sets a short stale-while-revalidate cache on a public card, and no-store on a miss", async () => {
    const acc = await signup("@AMR-610-610", "correct-battery-horse");
    const hit = await handlePublicCard(req(`/api/card/${encodeURIComponent(acc.nick)}`, { method: "GET" }), acc.nick);
    assert.equal(hit.status, 200);
    assert.equal(hit.headers.get("cache-control"), PUBLIC_CARD_CACHE);
    assert.match(PUBLIC_CARD_CACHE, /stale-while-revalidate/);
    const miss = await handlePublicCard(req("/api/card/@AMR-000-000", { method: "GET" }), "@AMR-000-000");
    assert.equal(miss.status, 404);
    assert.equal(miss.headers.get("cache-control"), "private, no-store");
  });
});
