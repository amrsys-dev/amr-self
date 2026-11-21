import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { adminNicks, isPlanApp, planOf, publicKeyOf, signEntitlement, verifyEntitlement } from "./plans.ts";

const seed = (generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" }) as { d: string }).d;

test("подпись тарифа проверяется открытым ключом, подделка - нет", () => {
  const tok = signEntitlement({ app: "cut", sub: "s1", nick: "murad.amr", plan: "pro", iat: 1, exp: 2 }, seed);
  const pub = publicKeyOf(seed);
  assert.equal(verifyEntitlement(tok, pub)?.plan, "pro");
  const [body, sig] = tok.split(".");
  const fake = Buffer.from(JSON.stringify({ app: "cut", sub: "s1", nick: "murad.amr", plan: "business", iat: 1, exp: 2 })).toString("base64url");
  assert.equal(verifyEntitlement(`${fake}.${sig}`, pub), null);
  assert.equal(verifyEntitlement(`${body}.${sig}.x`, pub), null);
});

test("тариф: истёкший и неизвестный → бесплатно", () => {
  assert.deepEqual(planOf(undefined, "cut"), { plan: "free" });
  assert.deepEqual(planOf({ cut: { plan: "pro", until: 1000 } }, "cut", 2000), { plan: "free" });
  assert.deepEqual(planOf({ cut: { plan: "pro", until: 3000 } }, "cut", 2000), { plan: "pro", until: 3000 });
  assert.deepEqual(planOf({ cut: { plan: "gold" } }, "cut"), { plan: "free" });
  assert.equal(isPlanApp("cut"), true);
  assert.equal(isPlanApp("toString"), false);
  assert.deepEqual(adminNicks(" Muradulla.AMR, ,x "), ["muradulla.amr", "x"]);
});
