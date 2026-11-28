import { test } from "node:test";
import assert from "node:assert/strict";

test("галочка: Telegram подтверждён кодом (вход или контакт) - да, иначе нет", async () => {
  const { accountVerified } = await import("./auth/handlers.ts");
  const base = { otp: {}, contacts: [] } as never;
  assert.equal(accountVerified(base), false);
  assert.equal(accountVerified({ otp: { telegram: { verified: true } }, contacts: [] } as never), true);
  assert.equal(accountVerified({ otp: {}, contacts: [{ id: "1", kind: "telegram", value: "@a", visible: true, verified: true }] } as never), true);
  assert.equal(accountVerified({ otp: {}, contacts: [{ id: "1", kind: "whatsapp", value: "+966", visible: true, verified: true }] } as never), false);
});

test("поиск людей: от 2 букв, по нику и имени, без @", async () => {
  const { findMatches, findKey } = await import("./auth/handlers.ts");
  assert.equal(findMatches("a", "ahmad.amr", "Ахмад"), false);
  assert.equal(findMatches("ahm", "ahmad.amr", ""), true);
  assert.equal(findMatches("@AHM", "ahmad.amr", ""), true);
  assert.equal(findMatches("ахма", "ahmad.amr", "Ахмад Али"), true);
  assert.equal(findMatches("taxi", "ahmad.amr", "Ахмад"), false);
  assert.equal(findKey("d1"), "find:d1");
});
