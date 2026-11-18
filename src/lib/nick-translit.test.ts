import { test } from "node:test";
import assert from "node:assert/strict";
import { toNickChars } from "./nick-translit.ts";

test("ФИО и длинные имена превращаются в ник", () => {
  assert.equal(toNickChars("Мурад Алиев"), "murad.aliev");
  assert.equal(toNickChars("Ҷамшед Қодиров"), "jamshed.qodirov");
  assert.equal(toNickChars("Abdulrahman bin Mohammed"), "abdulrahman.bin.mohammed");
  assert.equal(toNickChars("  @Ivan  Petrov!! "), "ivan.petrov.");
  assert.equal(toNickChars("عبد الله"), "abd.allh");
  assert.ok(toNickChars("a".repeat(50)).length <= 32);
});
