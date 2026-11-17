import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as { regions?: string[] };

describe("vercel.json", () => {
  it("pins functions to iad1, the region the privacy policy names", () => {
    assert.deepEqual(vercel.regions, ["iad1"]);
    const ru = readFileSync(new URL("../../legal/privacy-policy.ru.md", import.meta.url), "utf8");
    assert.match(ru, /регион iad1/);
  });
});
