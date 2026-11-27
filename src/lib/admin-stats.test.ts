import assert from "node:assert/strict";
import { test } from "node:test";
import { adminSig, appStats } from "./admin-stats.ts";

test("подпись админки совпадает с тем, что проверяют Safar и Hostel", () => {
  assert.equal(adminSig("k".repeat(40), "stats", "", 100), adminSig("k".repeat(40), "stats", "", 100));
  assert.notEqual(adminSig("k".repeat(40), "stats", "", 100), adminSig("k".repeat(40), "sub", "", 100));
});

test("приложение не ответило - null, без секрета - null", async () => {
  assert.equal(await appStats("safar", undefined), null);
  const bad = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
  assert.equal(await appStats("safar", "k".repeat(40), bad), null);
  const ok = (async () => Response.json({ users: 5 })) as unknown as typeof fetch;
  assert.deepEqual(await appStats("hostel", "k".repeat(40), ok), { users: 5 });
});

test("countPlans: платные, пробные, истёкшие не считаются", async () => {
  const { countPlans } = await import("./admin-stats.ts");
  const now = 1_000_000;
  const r = countPlans([
    { plans: { cut: { plan: "pro" }, safar: { plan: "pro", until: now + 1, trial: true } } },
    { plans: { cut: { plan: "business", until: now + 5 } } },
    { plans: { cut: { plan: "pro", until: now - 1 } } },
    null,
  ], ["cut", "safar"], now);
  assert.deepEqual(r, { cut: { pro: 1, trial: 0, business: 1 }, safar: { pro: 0, trial: 1, business: 0 } });
});

test("ownerPlan: владельцу высший тариф без срока", async () => {
  const { ownerPlan } = await import("./plans.ts");
  assert.deepEqual(ownerPlan("cut"), { plan: "business" });
  assert.deepEqual(ownerPlan("safar"), { plan: "pro" });
});
