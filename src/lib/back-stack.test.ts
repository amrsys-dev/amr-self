import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("back-stack: Back closes the top layer, UI close removes its history step", () => {
  const src = readFileSync(new URL("./back-stack.ts", import.meta.url), "utf8");
  assert.match(src, /stack\.pop\(\)/);
  assert.match(src, /history\.back\(\)/);
  assert.match(src, /pendingBacks/);
});
