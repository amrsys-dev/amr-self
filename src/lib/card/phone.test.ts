import { test } from "node:test";
import assert from "node:assert/strict";
import { contactHref, contactAction, displayContactValue, toPublicContacts, type Contact } from "./visibility.ts";
import { buildVcard } from "./vcard.ts";

const c = (kind: Contact["kind"], value: string): Contact => ({ id: "1", kind, value, visible: true, verified: false });

test("телефон: tel:-ссылка только из цифр, кнопка «Позвонить»", () => {
  assert.equal(contactHref(c("phone", "+966 50 123-45-67")), "tel:+966501234567");
  assert.equal(contactHref(c("phone", "0501234567")), "tel:0501234567");
  assert.equal(contactHref(c("phone", "12")), null);
  assert.equal(contactHref(c("phone", "javascript:alert(1)")), null);
  assert.equal(contactAction("phone"), "call");
  assert.equal(displayContactValue(c("phone", "+966 50 123<b>")), "+966 50 123");
});

test("Boosty: ник или ссылка", () => {
  assert.equal(contactHref(c("boosty", "murad")), "https://boosty.to/murad");
  assert.equal(contactHref(c("boosty", "https://boosty.to/murad")), "https://boosty.to/murad");
});

test("vCard: телефон как TEL", () => {
  const v = buildVcard({ nick: "a.amr", url: "", contacts: toPublicContacts([c("phone", "+966 501234567")]) });
  assert.match(v, /TEL;TYPE=CELL:\+966501234567/);
});

test("сайт: всегда https, нужен домен", () => {
  assert.equal(contactHref(c("website", "example.com")), "https://example.com");
  assert.equal(contactHref(c("website", "http://shop.example.sa/menu")), "https://shop.example.sa/menu");
  assert.equal(contactHref(c("website", "javascript:alert(1)")), null);
  assert.equal(contactHref(c("website", "localhost")), null);
  assert.equal(displayContactValue(c("website", "https://example.com/")), "example.com");
});
