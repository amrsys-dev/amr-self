import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeEqual } from "./secret-equal.ts";

describe("safeEqual", () => {
  it("accepts equal secrets and rejects a typo, a prefix, or a missing secret", () => {
    assert.equal(safeEqual("preview-do-secret-value", "preview-do-secret-value"), true);
    assert.equal(safeEqual("preview-do-secret-value", "preview-do-secret-valux"), false);
    assert.equal(safeEqual("preview-do-secret-value", "preview-do-secret"), false);
    assert.equal(safeEqual("", "x"), false);
    assert.equal(safeEqual("x", ""), false);
    assert.equal(safeEqual("", ""), true);
  });
});
