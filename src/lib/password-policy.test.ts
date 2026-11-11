import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkPassword } from "./password-policy.ts";

describe("password policy", () => {
  it("rejects short and common passwords", () => {
    assert.equal(checkPassword("short").ok, false);
    const short = checkPassword("123456789"); assert.equal(short.ok, false); if (!short.ok) assert.equal(short.reason, "short");
    const weak1 = checkPassword("password123"); assert.equal(weak1.ok, false); if (!weak1.ok) assert.equal(weak1.reason, "weak");
    const weak2 = checkPassword("1234567890"); assert.equal(weak2.ok, false); if (!weak2.ok) assert.equal(weak2.reason, "weak");
    const weak3 = checkPassword("aaaaaaaaaa"); assert.equal(weak3.ok, false); if (!weak3.ok) assert.equal(weak3.reason, "weak");
    const weak4 = checkPassword("qwertyuiop"); assert.equal(weak4.ok, false); if (!weak4.ok) assert.equal(weak4.reason, "weak");
  });

  it("rejects a password that contains the nick", () => {
    const nick = checkPassword("secretAMR417283x", "@AMR-417-283"); assert.equal(nick.ok, false); if (!nick.ok) assert.equal(nick.reason, "same_as_nick");
  });

  it("accepts a reasonably long unique password", () => {
    assert.deepEqual(checkPassword("correct-battery-horse"), { ok: true });
  });
});
