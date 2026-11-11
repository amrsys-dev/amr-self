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
          channel: "telegram",
          dest: "@omar.public",
          ageConfirmed: true,
        },
      }),
    ),
  );
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const otp = await json(await handleOtp(req("/api/auth/otp", { ip, body: { otpId: s.data.otpId, code: s.data.testOtp } })));
  assert.equal(otp.status, 200, JSON.stringify(otp.data));
  return { ...s.data, ...otp, dataKey, pwd, rec, recKeys, nick: (otp.data.nick as string) ?? (s.data.nick as string), cookie: otp.cookie! };
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
    const dead = await json(await handleMe(req("/api/me", { method: "GET", cookie: oldCookie })));
    assert.equal(dead.status, 401);
    const alive = await json(await handleMe(req("/api/me", { method: "GET", cookie: reset.cookie })));
    assert.equal(alive.status, 200);
  });

  it("limits contact-verification code attempts", async () => {
    process.env.AMR_OTP_EMAIL = "true";
    const acc = await signup("@AMR-530-530", "correct-battery-horse");
    const added = await json(
      await handleAddContact(req("/api/me/contacts", { cookie: acc.cookie, body: { kind: "email", value: "a@b.example" } })),
    );
    assert.equal(added.status, 200, JSON.stringify(added.data));
    const contact = added.data.contact as { id: string };
    let last = { status: 0, data: {} as Record<string, unknown> };
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      last = await json(
        await handleVerifyContact(
          req("/api/me/contacts/verify", {
            cookie: acc.cookie,
            body: { otpId: added.data.otpId, contactId: contact.id, code: "000000" },
          }),
        ),
      );
    }
    assert.equal(last.status, 429);
    assert.equal(last.data.error, "too_many_attempts");
    process.env.AMR_OTP_EMAIL = "false";
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
    const start = await json(
      await handleDeleteMe(
        req("/api/me/delete", { cookie: acc.cookie, body: { phase: "start", authKey: encodeAuthKey(acc.pwd.authKey) } }),
      ),
    );
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const del = await json(
      await handleDeleteMe(
        req("/api/me/delete", {
          cookie: acc.cookie,
          body: { phase: "confirm", authKey: encodeAuthKey(acc.pwd.authKey), otpId: start.data.otpId, code: start.data.testOtp },
        }),
      ),
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

  it("clears verified when a contact value or kind is patched", async () => {
    process.env.AMR_OTP_EMAIL = "true";
    const acc = await signup("@AMR-541-541", "correct-battery-horse");
    const added = await json(
      await handleAddContact(req("/api/me/contacts", { cookie: acc.cookie, body: { kind: "email", value: "a@b.example" } })),
    );
    const contact = added.data.contact as { id: string; verified: boolean; kind: string; value: string; visible: boolean };
    const verify = await json(
      await handleVerifyContact(
        req("/api/me/contacts/verify", { cookie: acc.cookie, body: { otpId: added.data.otpId, contactId: contact.id, code: added.data.testOtp } }),
      ),
    );
    assert.equal(verify.status, 200, JSON.stringify(verify.data));
    assert.equal((verify.data.contact as { verified: boolean }).verified, true);
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
    process.env.AMR_OTP_EMAIL = "false";
  });

  it("does not switch the 2FA channel on contact verify; change needs password and a code from the old channel", async () => {
    const acc = await signup("@AMR-570-570", "correct-battery-horse");
    const added = await json(
      await handleAddContact(req("/api/me/contacts", { cookie: acc.cookie, body: { kind: "telegram", value: "@new.channel" } })),
    );
    assert.equal(added.status, 200, JSON.stringify(added.data));
    const contact = added.data.contact as { id: string };
    const verified = await json(
      await handleVerifyContact(
        req("/api/me/contacts/verify", { cookie: acc.cookie, body: { otpId: added.data.otpId, contactId: contact.id, code: added.data.testOtp } }),
      ),
    );
    assert.equal(verified.status, 200, JSON.stringify(verified.data));
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

  it("rejects signup without the 18+ confirmation and rejects email OTP while the flag is off", async () => {
    const pwd = await derivePasswordKeys("correct-battery-horse");
    const rec = await deriveRecoveryKeys(generateRecoveryCode());
    const dataKey = await generateDataKey();
    const noAge = await json(
      await handleSignup(
        req("/api/auth/signup", {
          body: {
            nick: "@AMR-580-580",
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
    assert.equal(noAge.status, 400);
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
    assert.equal(email.status, 400);
    assert.equal(email.data.error, "email_otp_disabled");
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
    const otp = await json(await handleOtp(req("/api/auth/otp", { body: { otpId: s.data.otpId, code: s.data.testOtp } })));
    assert.equal(otp.status, 200, JSON.stringify(otp.data));
    const kdf = await json(await handleKdf(req("/api/auth/kdf", { body: { nick: otp.data.nick, purpose: "recovery" } })));
    assert.equal(kdf.status, 200);
    const kdfs = kdf.data.kdfs as { salt: string }[];
    assert.equal(kdfs.length, 2);
    assert.notEqual(kdfs[0]?.salt, kdfs[1]?.salt);
    const first = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: otp.data.nick, recoveryVerifyKey: encodeAuthKey(recKeys[0]!.verifyKey), phase: "unlock" },
        }),
      ),
    );
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const withSecond = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: otp.data.nick, recoveryVerifyKey: encodeAuthKey(recKeys[1]!.verifyKey), phase: "unlock" },
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
    const otp = await json(await handleOtp(req("/api/auth/otp", { body: { otpId: s.data.otpId, code: s.data.testOtp } })));
    assert.equal(otp.status, 200, JSON.stringify(otp.data));
    const kdf = await json(await handleKdf(req("/api/auth/kdf", { body: { nick: otp.data.nick, purpose: "recovery" } })));
    const kdfs = kdf.data.kdfs as { salt: string }[];
    assert.equal(kdfs.length, 2);
    const unlock = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: otp.data.nick,
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
            nick: otp.data.nick,
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
            body: { nick: otp.data.nick, recoveryVerifyKey: encodeAuthKey(k.verifyKey), phase: "unlock" },
          }),
        ),
      );
      assert.equal(old.status, 401);
      assert.equal(old.data.error, "recovery_replaced");
    }
    const ok = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: otp.data.nick, recoveryVerifyKey: encodeAuthKey(fresh[1]!.verifyKey), phase: "unlock" },
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
    const otp = await json(await handleOtp(req("/api/auth/otp", { body: { otpId: s.data.otpId, code: s.data.testOtp } })));
    assert.equal(otp.status, 200, JSON.stringify(otp.data));
    const start = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: otp.data.nick,
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
    const raw = await getStores().kv.get(nickKey(otp.data.nick as string));
    assert.ok(raw);
    const user = JSON.parse(raw!) as { recoveryHashes: string[]; wrapRecoveries: unknown[]; recoveryKdfs: unknown[]; recoveryHash: string; wrapRecovery: unknown; kdf: { recovery: unknown } };
    user.recoveryHashes = user.recoveryHashes.slice(1);
    user.wrapRecoveries = user.wrapRecoveries.slice(1);
    user.recoveryKdfs = user.recoveryKdfs.slice(1);
    user.recoveryHash = user.recoveryHashes[0]!;
    user.wrapRecovery = user.wrapRecoveries[0];
    user.kdf = { ...user.kdf, recovery: user.recoveryKdfs[0] };
    await getStores().kv.put(nickKey(otp.data.nick as string), JSON.stringify(user));
    const confirm = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: otp.data.nick,
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
          body: { nick: otp.data.nick, recoveryVerifyKey: encodeAuthKey(recKeys[1]!.verifyKey), phase: "unlock" },
        }),
      ),
    );
    assert.equal(burned.status, 401);
    assert.equal(burned.data.error, "recovery_replaced");
    const leftover = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: { nick: otp.data.nick, recoveryVerifyKey: encodeAuthKey(recKeys[2]!.verifyKey), phase: "unlock" },
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
