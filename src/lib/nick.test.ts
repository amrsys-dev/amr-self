import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateNick,
  normalizeNick,
  parseNickFormat,
  publicCardPath,
} from "./nick.ts";

describe("nick format", () => {
  it("parses default xxx-xxx", () => {
    const fmt = parseNickFormat("xxx-xxx");
    assert.deepEqual(fmt.groups, [3, 3]);
    assert.equal(normalizeNick("@AMR-417-283", fmt), "@AMR-417-283");
    assert.equal(normalizeNick("amr-417-283", fmt), "@AMR-417-283");
    assert.equal(normalizeNick("AMR-100-001", fmt), "@AMR-100-001");
    assert.equal(normalizeNick("@AMR-41-283", fmt), null);
    assert.equal(normalizeNick("@AMR-4172-8301", fmt), null);
    assert.equal(normalizeNick("@foo-417-283", fmt), null);
    assert.equal(publicCardPath("@AMR-417-283"), "/u/AMR-417-283");
  });

  it("supports configurable xxxx-xxxx", () => {
    const fmt = parseNickFormat("xxxx-xxxx");
    assert.deepEqual(fmt.groups, [4, 4]);
    assert.equal(normalizeNick("@AMR-4172-8301", fmt), "@AMR-4172-8301");
    assert.equal(normalizeNick("@AMR-417-283", fmt), null);
  });

  it("rejects bad format specs", () => {
    assert.throws(() => parseNickFormat("abc"));
    assert.throws(() => parseNickFormat("x"));
  });

  it("generates nicks that match the format", () => {
    const fmt = parseNickFormat("xxx-xxx");
    const seq = new Uint8Array([4, 1, 7, 2, 8, 3, 9, 9]);
    let offset = 0;
    const rnd = (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = seq[offset++ % seq.length]!;
      return arr;
    };
    const nick = generateNick(fmt, rnd);
    assert.equal(nick, "@AMR-417-283");
    assert.equal(normalizeNick(nick, fmt), nick);
  });
});
