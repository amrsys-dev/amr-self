import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryStores } from "./storage/memory.ts";
import { cloudAllowed, cloudRead, cloudWrite, CLOUD_MAX_BYTES } from "./cloud.ts";

const bytes = (s: string) => new TextEncoder().encode(s);

test("облако: только платный тариф", () => {
  assert.equal(cloudAllowed(undefined, "cut"), false);
  assert.equal(cloudAllowed({ cut: { plan: "free" } }, "cut"), false);
  assert.equal(cloudAllowed({ cut: { plan: "pro" } }, "cut"), true);
  assert.equal(cloudAllowed({ cut: { plan: "business", until: 1000 } }, "cut", 2000), false);
});

test("облако: запись по номеру, чужая запись между ними — конфликт, старый файл удаляется", async () => {
  const { kv, blobs } = createMemoryStores();
  assert.equal(await cloudRead(kv, blobs, "cut", "u1"), null);
  const a = await cloudWrite(kv, blobs, "cut", "u1", 0, bytes("one"));
  assert.ok(a.ok && a.meta.rev === 1);
  const stale = await cloudWrite(kv, blobs, "cut", "u1", 0, bytes("phone2"));
  assert.deepEqual(stale, { ok: false, reason: "conflict", rev: 1 });
  const b = await cloudWrite(kv, blobs, "cut", "u1", 1, bytes("two"));
  assert.ok(b.ok && b.meta.rev === 2);
  const r = await cloudRead(kv, blobs, "cut", "u1");
  assert.equal(new TextDecoder().decode(r!.data), "two");
  assert.deepEqual(await blobs.list("cloud/cut/u1/"), ["cloud/cut/u1/2.bin"]);
  assert.equal(await cloudRead(kv, blobs, "cut", "u2"), null);
});

test("облако: пустой и слишком большой файл не принимаются", async () => {
  const { kv, blobs } = createMemoryStores();
  assert.deepEqual(await cloudWrite(kv, blobs, "cut", "u", 0, new Uint8Array()), { ok: false, reason: "empty" });
  assert.deepEqual(await cloudWrite(kv, blobs, "cut", "u", 0, new Uint8Array(CLOUD_MAX_BYTES + 1)), { ok: false, reason: "too_big" });
});
