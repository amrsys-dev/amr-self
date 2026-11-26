import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateNick, nickProblem, normalizeNick, parseNickFormat, publicCardPath } from "./nick.ts";

describe("AMR human-readable nicknames", () => {
  const fmt = parseNickFormat();
  it("normalizes supported forms to one canonical .amr handle", () => {
    assert.equal(normalizeNick("@Name", fmt), "name.amr");
    assert.equal(normalizeNick("name.amr", fmt), "name.amr");
    assert.equal(normalizeNick("@name@amr", fmt), "name.amr");
    assert.equal(normalizeNick("name@amr", fmt), "name.amr");
    assert.equal(normalizeNick("Name_Design", fmt), "name_design.amr");
    assert.equal(normalizeNick("@name-design", fmt), "name-design.amr");
  });
  it("preserves legacy AMR numeric IDs for existing accounts", () => {
    assert.equal(normalizeNick("@AMR-417-283", fmt), "@AMR-417-283");
    assert.equal(normalizeNick("amr-100-001", fmt), "@AMR-100-001");
  });
  it("rejects invalid and reserved handles", () => {
    assert.equal(normalizeNick("ab"), null);
    assert.equal(normalizeNick("@admin", fmt), null);
    assert.equal(normalizeNick("@bad name", fmt), null);
    assert.equal(normalizeNick("@bad/name", fmt), null);
    assert.equal(normalizeNick("@name..x", fmt), null);
  });
  it("uses the canonical handle in public card paths", () => {
    assert.equal(publicCardPath("name.amr"), "/u/name.amr");
    assert.equal(publicCardPath("@AMR-417-283"), "/u/AMR-417-283");
  });
  it("generates valid fallback suggestions", () => {
    const seq = new Uint8Array([4, 1, 7, 2, 8]);
    const nick = generateNick(fmt, (arr) => { arr.set(seq); return arr; });
    assert.equal(nick, "member-ebhci.amr");
    assert.equal(normalizeNick(nick, fmt), nick);
  });
});

it("nickProblem: служебные слова отдельно от формата, длина до 32", () => {
  assert.equal(nickProblem("system"), "reserved");
  assert.equal(nickProblem("AMR.amr"), "reserved");
  // 26.11.2026: похожие на администрацию имена и названия приложений тоже заняты
  for (const n of ["admin1", "admin-amr", "system.bot", "support24", "moderator", "safar", "hostel.amr", "amrsys"]) assert.equal(nickProblem(n), "reserved", n);
  assert.equal(nickProblem("muradulla"), null);
  assert.equal(nickProblem("amrullo"), null);
  assert.equal(nickProblem("ab"), "format");
  assert.equal(nickProblem("abdulrahman.bin.mohammed.alqahtani"), "format");
  assert.equal(nickProblem("abdulrahman.bin.mohammed"), null);
  assert.equal(nickProblem("amrsystems"), null);
});
