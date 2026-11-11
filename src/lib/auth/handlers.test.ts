import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { derivePasswordKeys, deriveRecoveryKeys, encodeAuthKey, generateDataKey, generateRecoveryCode, wrapDataKey } from "../crypto.ts";
import { resetStoresForTests } from "../storage/index.ts";
import { getStores } from "../storage/index.ts";
import { reservedNickKey as reservedKey } from "../nick-reserve.ts";
import { nickKey } from "../user.ts";
import {
  handleAddContact,
  handleKdf,
  handleLogin,
  handleMe,
  handleNickCheck,
  handleOtp,
  handlePutData,
  handleRecovery,
  handleSignup,
  reserveNick,
} from "./handlers.ts";

process.env.AMR_STORE = "memory";
process.env.OTP_MODE = "test";
process.env.AMR_NICK_REISSUE = "false";
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
          channel: "telegram",
          dest: "@omar.public",
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

  it("issues a new recovery code after reset and rejects the old verify key", async () => {
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
    const newCode = generateRecoveryCode();
    const newRec = await deriveRecoveryKeys(newCode);
    const wrapPassword = await wrapDataKey(acc.dataKey, newPwd.wrapKey);
    const wrapRecovery = await wrapDataKey(acc.dataKey, newRec.wrapKey);
    const reset = await json(
      await handleRecovery(
        req("/api/auth/recovery", {
          body: {
            nick: acc.nick,
            recoveryVerifyKey: encodeAuthKey(acc.recKeys.verifyKey),
            authKey: encodeAuthKey(newPwd.authKey),
            wrapPassword,
            wrapRecovery,
            recoveryVerifyKeyNew: encodeAuthKey(newRec.verifyKey),
            kdfPassword: newPwd.params,
            kdfRecovery: newRec.params,
            phase: "reset",
          },
        }),
      ),
    );
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.equal(reset.data.newRecoveryIssued, true);

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
});
