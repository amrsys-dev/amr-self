import { test } from "node:test";
import assert from "node:assert/strict";
import { cardPatternUrl, cardPatternSize } from "./patterns.ts";
import { CARD_THEMES } from "./visibility.ts";

test("узоры визиток: у каждой темы, кроме «Минимал», лёгкий вектор", () => {
  for (const th of CARD_THEMES) {
    const u = cardPatternUrl(th);
    if (th === "minimal") { assert.equal(u, null); continue; }
    assert.ok(u && u.startsWith('url("data:image/svg+xml,'), th);
    assert.ok(u.length < 4000, `${th} слишком тяжёлый: ${u.length}`);
    assert.ok(cardPatternSize(th) > 0);
  }
});
