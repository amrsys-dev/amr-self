import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateNick, normalizeNick, parseNickFormat, publicCardPath } from "./nick.ts";

describe("AMR human-readable nicknames", () => {
  const fmt = parseNickFormat();
  it("normalizes supported forms to one canonical .amr handle", () => {
    assert.equal(normalizeNick("@Murad", fmt), "murad.amr");
    assert.equal(normalizeNick("murad.amr", fmt), "murad.amr");
    assert.equal(normalizeNick("@murad@amr", fmt), "murad.amr");
    assert.equal(normalizeNick("murad@amr", fmt), "murad.amr");
    assert.equal(normalizeNick("Murad_Design", fmt), "murad_design.amr");
    assert.equal(normalizeNick("@murad-design", fmt), "murad-design.amr");
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
    assert.equal(normalizeNick("@murad..x", fmt), null);
  });
  it("uses the canonical handle in public card paths", () => {
    assert.equal(publicCardPath("murad.amr"), "/u/murad.amr");
    assert.equal(publicCardPath("@AMR-417-283"), "/u/AMR-417-283");
  });
  it("generates valid fallback suggestions", () => {
    const seq = new Uint8Array([4, 1, 7, 2, 8]);
    const nick = generateNick(fmt, (arr) => { arr.set(seq); return arr; });
    assert.equal(nick, "member-ebhci.amr");
    assert.equal(normalizeNick(nick, fmt), nick);
  });
});
