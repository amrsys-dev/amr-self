import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_THEMES, cardBackground, clampCoverY, parseCardTheme } from "./visibility.ts";

test("фон визитки: своё фото, готовые фоны, старые темы", () => {
  assert.equal(CARD_THEMES[0], "own");
  assert.equal(parseCardTheme("taxi"), "taxi");
  assert.equal(parseCardTheme("graphite"), "own");
  assert.equal(parseCardTheme("gothic"), "owner");
  assert.equal(parseCardTheme("<script>"), "own");
  assert.equal(cardBackground("own"), null);
  assert.equal(cardBackground("bakery"), "/cards/bakery.svg");
});

test("положение фона 0…100", () => {
  assert.equal(clampCoverY(undefined), 50);
  assert.equal(clampCoverY(-5), 0);
  assert.equal(clampCoverY(140), 100);
  assert.equal(clampCoverY(33.6), 34);
  assert.equal(clampCoverY("x"), 50);
});
