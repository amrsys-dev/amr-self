import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_TG_BOT } from "./auth/telegram-link.ts";

const root = new URL("../../", import.meta.url);
const html = readFileSync(new URL("public/privacy.html", root), "utf8");
const legalDir = new URL("legal/", root);
const policies = readdirSync(legalDir)
  .filter((name) => /^privacy-policy\.(ru|en|ar|uz|tj)\.md$/.test(name))
  .sort()
  .map((name) => ({ name, text: readFileSync(new URL(name, legalDir), "utf8") }));

describe("privacy policy page", () => {
  it("covers all five language sources and page sections", () => {
    assert.deepEqual(
      policies.map((p) => p.name),
      [
        "privacy-policy.ar.md",
        "privacy-policy.en.md",
        "privacy-policy.ru.md",
        "privacy-policy.tj.md",
        "privacy-policy.uz.md",
      ],
    );
    for (const id of ["ru", "en", "ar", "uz", "tj"]) {
      assert.match(html, new RegExp(`<article id="${id}"`));
    }
  });

  it("does not mention amr.id or amrid.app", () => {
    const files = [...policies.map((p) => p.text), html];
    for (const text of files) {
      assert.doesNotMatch(text, /amr\.id|amrid\.app/i);
    }
  });

  it("names the live domain in RU, EN and AR", () => {
    for (const name of ["privacy-policy.ru.md", "privacy-policy.en.md", "privacy-policy.ar.md"]) {
      const text = policies.find((p) => p.name === name)!.text;
      assert.match(text, /self\.amrsys\.net/);
    }
    assert.equal([...html.matchAll(/href="https:\/\/self\.amrsys\.net"/g)].length, 3);
  });

  it("renders contacts as clickable mailto and Telegram links, not raw markdown", () => {
    assert.doesNotMatch(html, /\[[^\]]+\]\((mailto:[^)]+|https:\/\/t\.me\/[^)]+)\)/);
    assert.equal([...html.matchAll(/href="mailto:amrsys\.dev@gmail\.com"/g)].length, 9);
    assert.equal([...html.matchAll(/href="https:\/\/t\.me\/amr_ecosystems"/g)].length, 9);
    assert.match(html, /<a href="mailto:amrsys\.dev@gmail\.com">amrsys\.dev@gmail\.com<\/a>/);
    assert.match(html, /<a href="https:\/\/t\.me\/amr_ecosystems">@amr_ecosystems<\/a>/);
  });

  it("has no draft notice left in the sources or the published page", () => {
    const files = [...policies.map((p) => p.text), html];
    for (const text of files) {
      assert.doesNotMatch(text, /черновик/i);
      assert.doesNotMatch(text, /в сервисе не размещать/);
      assert.doesNotMatch(text, /draft v0\.4/i);
      assert.doesNotMatch(text, /0\.4-draft/i);
      assert.doesNotMatch(text, /as of this draft/i);
      assert.doesNotMatch(text, /Do not put this on the live service/i);
      assert.doesNotMatch(text, /مسودة/);
      assert.doesNotMatch(text, /لا يُوضع في الخدمة/);
    }
  });

  it("states version 1.0 dated 17.11.2026 in RU, EN and AR", () => {
    const ru = policies.find((p) => p.name === "privacy-policy.ru.md")!.text;
    const en = policies.find((p) => p.name === "privacy-policy.en.md")!.text;
    const ar = policies.find((p) => p.name === "privacy-policy.ar.md")!.text;
    assert.match(ru, /Версия 1\.0, 17\.11\.2026/);
    assert.match(en, /Version 1\.0, 17\.11\.2026/);
    assert.match(ar, /النسخة 1\.0، 17\.11\.2026/);
    assert.match(html, /Версия 1\.0, 17\.11\.2026/);
    assert.match(html, /Version 1\.0, 17\.11\.2026/);
    assert.match(html, /النسخة 1\.0، 17\.11\.2026/);
  });

  it("has no placeholder markers left in the sources or the published page", () => {
    const files = [...policies.map((p) => ({ name: p.name, text: p.text })), { name: "privacy.html", text: html }];
    for (const { name, text } of files) {
      assert.doesNotMatch(text, /УТОЧНИТЬ/, name);
      assert.doesNotMatch(text, /TO CONFIRM/i, name);
      assert.doesNotMatch(text, /يلزم التأكيد/, name);
    }
  });

  it("names the real Telegram bot and the SDAIA site in RU, EN and AR", () => {
    for (const name of ["privacy-policy.ru.md", "privacy-policy.en.md", "privacy-policy.ar.md"]) {
      const text = policies.find((p) => p.name === name)!.text;
      assert.ok(text.includes(`[@${DEFAULT_TG_BOT}](https://t.me/${DEFAULT_TG_BOT})`), name);
      assert.ok(text.includes("(https://sdaia.gov.sa)"), name);
    }
    assert.equal([...html.matchAll(new RegExp(`href="https://t\\.me/${DEFAULT_TG_BOT}"`, "g"))].length, 3);
    assert.equal([...html.matchAll(/href="https:\/\/sdaia\.gov\.sa"/g)].length, 3);
  });
});
