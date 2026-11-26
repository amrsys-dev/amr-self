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
