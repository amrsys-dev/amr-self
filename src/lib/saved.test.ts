import { test } from "node:test";
import assert from "node:assert/strict";
import { addSaved, parseSaved, removeSaved, SAVED_MAX } from "./saved.ts";

test("контакты: новые сверху, без повторов и без себя, удаление", () => {
  let l = addSaved([], ["ali.amr"], "me.amr", 100);
  l = addSaved(l, ["sara.amr", "ali.amr", "me.amr"], "me.amr", 200);
  assert.deepEqual(l.map((x) => x.nick), ["sara.amr", "ali.amr"]);
  l = removeSaved(l, "sara.amr");
  assert.deepEqual(l.map((x) => x.nick), ["ali.amr"]);
  assert.deepEqual(parseSaved("oops"), []);
});

test("контакты: не больше предела", () => {
  const many = Array.from({ length: SAVED_MAX + 20 }, (_, i) => `u${i}.amr`);
  assert.equal(addSaved([], many, "me.amr").length, SAVED_MAX);
});
