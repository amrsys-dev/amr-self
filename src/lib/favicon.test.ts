import { test } from "node:test";
import assert from "node:assert/strict";
import { safeHost, iconLinks, ICON_TYPES } from "./favicon.ts";

test("только публичные домены", () => {
  assert.equal(safeHost("https://Shop.Example.sa/menu"), "shop.example.sa");
  assert.equal(safeHost("localhost"), null);
  assert.equal(safeHost("127.0.0.1"), null);
  assert.equal(safeHost("printer.local"), null);
  assert.equal(safeHost("evil.com@10.0.0.1"), null);
  assert.equal(safeHost("a"), null);
});

test("иконки со страницы: apple-touch-icon первым, svg и http пропускаются", () => {
  const html = `<link rel="icon" href="/f.ico"><link rel="apple-touch-icon" sizes="180x180" href="/a.png"><link rel="icon" href="/i.svg"><link rel="icon" href="http://x.com/h.png">`;
  assert.deepEqual(iconLinks(html, "https://site.com/"), ["https://site.com/a.png", "https://site.com/f.ico"]);
});

test("типы изображений: без svg", () => {
  assert.ok(ICON_TYPES.test("image/png"));
  assert.ok(!ICON_TYPES.test("image/svg+xml"));
  assert.ok(!ICON_TYPES.test("text/html"));
});
