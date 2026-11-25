import { test } from "node:test";
import assert from "node:assert/strict";
import { hostelSubs, subsSig } from "./hostel-subs.ts";

const S = "s".repeat(40);

test("подписки хостелов: подписанный запрос и разбор ответа", async () => {
  let url = "";
  const fake = (async (u: string) => {
    url = u;
    return new Response(JSON.stringify({ hostels: [{ id: 3, name: "Нур", until: 1_900_000_000_000, status: "active" }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await hostelSubs("u1", "ali.amr", S, "https://h.test", fake);
  assert.deepEqual(r, [{ id: 3, name: "Нур", until: 1_900_000_000_000, status: "active" }]);
  const q = new URL(url).searchParams;
  assert.equal(q.get("sig"), subsSig(S, "u1", "ali.amr", Number(q.get("exp"))));
});

test("подписки хостелов: без секрета или при ошибке - null", async () => {
  const bad = (async () => new Response("x", { status: 403 })) as unknown as typeof fetch;
  assert.equal(await hostelSubs("u1", "ali.amr", undefined, "https://h.test", bad), null);
  assert.equal(await hostelSubs("u1", "ali.amr", S, "https://h.test", bad), null);
  const boom = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
  assert.equal(await hostelSubs("u1", "ali.amr", S, "https://h.test", boom), null);
});
