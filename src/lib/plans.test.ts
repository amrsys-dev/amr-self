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

test("пробный Pro: один раз на аккаунт, не поверх платного, 14 дней", async () => {
  const { grantTrial, planOf, TRIAL_DAYS } = await import("./plans.ts");
  const now = 1_000_000;
  const g = grantTrial(undefined, undefined, "cut", now)!;
  assert.equal(g.plans.cut!.plan, "pro");
  assert.equal(g.plans.cut!.until, now + TRIAL_DAYS * 86400_000);
  assert.deepEqual(planOf(g.plans, "cut", now + 1), { plan: "pro", until: now + TRIAL_DAYS * 86400_000, trial: true });
  assert.equal(planOf(g.plans, "cut", now + TRIAL_DAYS * 86400_000 + 1).plan, "free");
  assert.equal(grantTrial(g.plans, g.trials, "cut", now + 99), null); // second time - no
  assert.equal(grantTrial({ cut: { plan: "business" } }, undefined, "cut", now), null); // already paid
  assert.ok(grantTrial(g.plans, g.trials, "safar", now)); // other app - own trial
});

test("AMR 3Design: тариф free/pro, пробный Pro один раз, вход только с 3d.amrsys.net", async () => {
  const { grantTrial, planOf, isPlanApp, isPlanOf, PLAN_ORIGINS, TRIAL_DAYS } = await import("./plans.ts");
  const now = 1_000_000;
  assert.equal(isPlanApp("3d"), true);
  assert.equal(isPlanOf("3d", "pro"), true);
  assert.equal(isPlanOf("3d", "business"), false);
  assert.deepEqual(planOf(undefined, "3d"), { plan: "free" });
  const g = grantTrial(undefined, undefined, "3d", now)!;
  assert.deepEqual(planOf(g.plans, "3d", now + 1), { plan: "pro", until: now + TRIAL_DAYS * 86400_000, trial: true });
  assert.equal(grantTrial(g.plans, g.trials, "3d", now + 99), null);
  assert.deepEqual([...PLAN_ORIGINS["3d"]], ["https://3d.amrsys.net"]);
});
