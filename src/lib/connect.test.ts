import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { checkConnect, signConnectToken, connectRedirect, displayNameOf, TOKEN_TTL_SEC } from "./connect.ts";

const RET = "https://bazar.amrsys.net/api/auth/amrid";
const STATE = "abcDEF123_-abcDEF123";

test("только белый список адресов и приложений", () => {
  assert.ok(checkConnect("bazar", RET, STATE));
  assert.equal(checkConnect("bazar", "https://evil.example/api/auth/amrid", STATE), null);
  assert.equal(checkConnect("bazar", RET + "?x=1", STATE), null);
  assert.equal(checkConnect("bazar", "https://bazar.amrsys.net.evil.com/api/auth/amrid", STATE), null);
  assert.equal(checkConnect("other", RET, STATE), null);
  assert.equal(checkConnect("__proto__", RET, STATE), null);
  assert.equal(checkConnect("bazar", RET, "short"), null);
  assert.equal(checkConnect("bazar", RET, "bad state with spaces!!"), null);
});

test("токен: подпись, срок 5 минут, только ник и имя", () => {
  const t = signConnectToken({ sub: "id-1", nick: "name.amr", name: "name", aud: "bazar", state: STATE }, "s".repeat(32), 1000, "j1");
  const [body, sig] = t.split(".");
  assert.equal(sig, createHmac("sha256", "s".repeat(32)).update(body).digest("base64url"));
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  assert.deepEqual(Object.keys(p).sort(), ["aud", "exp", "iat", "jti", "name", "nick", "state", "sub"]);
  assert.equal(p.exp - p.iat, TOKEN_TTL_SEC);
  assert.equal(p.aud, "bazar");
});

test("адрес возврата и имя", () => {
  const r = checkConnect("bazar", RET, STATE)!;
  const u = new URL(connectRedirect(r, "a.b"));
  assert.equal(u.origin + u.pathname, RET);
  assert.equal(u.searchParams.get("token"), "a.b");
  assert.equal(u.searchParams.get("state"), STATE);
  assert.equal(displayNameOf("Name.amr"), "Name");
});

test("проверка токена для SELF: подпись, приложение, state, срок", async () => {
  const { verifyConnectToken } = await import("./connect.ts");
  const secret = "k".repeat(40);
  const tok = signConnectToken({ sub: "id-9", nick: "murad.amr", name: "murad", aud: "self", state: STATE }, secret, 1000, "j9");
  assert.deepEqual(verifyConnectToken(tok, secret, "self", STATE, 1100), { sub: "id-9", nick: "murad.amr" });
  assert.equal(verifyConnectToken(tok, secret, "bazar", STATE, 1100), null);
  assert.equal(verifyConnectToken(tok, secret, "self", "otherState_123456", 1100), null);
  assert.equal(verifyConnectToken(tok, secret, "self", STATE, 1000 + TOKEN_TTL_SEC + 1), null);
  assert.equal(verifyConnectToken(tok, "x".repeat(40), "self", STATE, 1100), null);
  assert.equal(verifyConnectToken(tok + "a", secret, "self", STATE, 1100), null);
  assert.equal(verifyConnectToken(tok + ".x", secret, "self", STATE, 1100), null);
});
