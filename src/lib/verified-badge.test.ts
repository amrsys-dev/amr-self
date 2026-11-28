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
