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

  it("has no lawyer-pending or preview-only claims left", () => {
    const files = [...policies.map((p) => ({ name: p.name, text: p.text })), { name: "privacy.html", text: html }];
    for (const { name, text } of files) {
      assert.doesNotMatch(text, /юрист/i, name);
      assert.doesNotMatch(text, /preview на тестовых данных|Реальные данные людей не собираем|реальные данные людей не собираем/, name);
      assert.doesNotMatch(text, /lawyer|counsel/i, name);
      assert.doesNotMatch(text, /preview on test data|do not collect real people/i, name);
      assert.doesNotMatch(text, /المحامي/, name);
      assert.doesNotMatch(text, /بيانات تجريبية|ما نجمع بيانات ناس حقيقية/, name);
    }
  });

  it("does not say Telegram is required to sign in, and lists the sign-in methods", () => {
    const files = [...policies.map((p) => ({ name: p.name, text: p.text })), { name: "privacy.html", text: html }];
    for (const { name, text } of files) {
      assert.doesNotMatch(text, /Без привязанного Telegram войти в сервис нельзя/, name);
      assert.doesNotMatch(text, /cannot sign in without a linked Telegram/i, name);
      assert.doesNotMatch(text, /بدون تلغرام مربوط ما تقدر تدخل/, name);
      assert.doesNotMatch(text, /одноразовую ссылку на бота|one-time link to the bot|رابطاً للبوت لمرة/, name);
    }
    const ru = policies.find((p) => p.name === "privacy-policy.ru.md")!.text;
    const en = policies.find((p) => p.name === "privacy-policy.en.md")!.text;
    const ar = policies.find((p) => p.name === "privacy-policy.ar.md")!.text;
    assert.match(ru, /Аккаунт создаётся по нику и паролю, Telegram для этого не нужен/);
    assert.match(en, /Telegram is not needed for that/);
    assert.match(ar, /وما يحتاج تلغرام/);
    for (const t of [ru, en, ar]) assert.match(t, /Google/);
  });

  it("section 10 matches the code: no sign-in with the same Telegram, deleted nick stays reserved", () => {
    const files = [...policies.map((p) => ({ name: p.name, text: p.text })), { name: "privacy.html", text: html }];
    for (const { name, text } of files) {
      assert.doesNotMatch(text, /Вход с тем же Telegram/, name);
      assert.doesNotMatch(text, /same Telegram account only creates/i, name);
      assert.doesNotMatch(text, /بنفس تلغرام ينشئ/, name);
    }
    const want: Record<string, RegExp> = {
      "privacy-policy.ru.md": /создайте новый аккаунт с новым ником/,
      "privacy-policy.en.md": /create a new account with a new nick/,
      "privacy-policy.ar.md": /أنشئ حساباً جديداً بمعرف جديد/,
    };
    for (const [name, re] of Object.entries(want)) {
      assert.match(policies.find((p) => p.name === name)!.text, re, name);
      assert.match(html, re, name);
    }
  });

  describe("SECURITY review fixes (storage, transfer basis, nick, complaints, card)", () => {
    const all = [...policies.map((p) => ({ name: p.name, text: p.text })), { name: "privacy.html", text: html }];
    const main = ["privacy-policy.ru.md", "privacy-policy.en.md", "privacy-policy.ar.md"].map((name) => ({
      name,
      text: policies.find((p) => p.name === name)!.text,
    }));

    it("does not claim all Cloudflare data is in the EU; names KV/Durable Objects and R2 (EU)", () => {
      for (const { name, text } of all) {
        assert.doesNotMatch(text, /Данные Cloudflare хранятся в Европейском союзе/, name);
        assert.doesNotMatch(text, /Cloudflare data is stored in the European Union/i, name);
        assert.doesNotMatch(text, /بيانات Cloudflare محفوظة في الاتحاد الأوروبي/, name);
        assert.doesNotMatch(text, /Долговременное хранение у Cloudflare — в Европе/, name);
        assert.doesNotMatch(text, /Long-term storage with Cloudflare is in Europe/i, name);
      }
      for (const { name, text } of [...main, { name: "privacy.html", text: html }]) {
        assert.match(text, /Cloudflare KV/, name);
        assert.match(text, /Durable Objects/, name);
        assert.match(text, /Cloudflare R2/, name);
      }
    });

    it("states the transfer basis, without «будет оформлено»", () => {
      for (const { name, text } of all) {
        assert.doesNotMatch(text, /будет оформлено/, name);
        assert.doesNotMatch(text, /to be formalised/i, name);
        assert.doesNotMatch(text, /ستُستكمل/, name);
      }
      const ru = main[0]!.text;
      assert.match(ru, /Основание передачи: она нужна, чтобы дать вам сервис, который вы сами запросили/);
      assert.match(ru, /по правилам SDAIA о передаче персональных данных за пределы Королевства/);
      assert.match(main[1]!.text, /SDAIA rules on transferring personal data outside the Kingdom/);
      assert.match(main[2]!.text, /قواعد سدايا لنقل البيانات الشخصية خارج المملكة/);
    });

    it("describes the real nick rule from src/lib/nick.ts", () => {
      for (const { name, text } of all) {
        assert.doesNotMatch(text, /@AMR-…/, name);
        assert.doesNotMatch(text, /не утверждён|not yet approved|ما اعتمدت/, name);
      }
      for (const { name, text } of [...main, { name: "privacy.html", text: html }]) {
        assert.match(text, /name\.amr/, name);
        assert.match(text, /3[^0-9]{1,12}24/, name);
      }
    });

    it("has no impersonation-report retention (no such feature in code)", () => {
      for (const { name, text } of all) {
        assert.doesNotMatch(text, /90 дней|90 days|90 يوماً/, name);
        assert.doesNotMatch(text, /Жалобы на подделку хранятся/, name);
        assert.doesNotMatch(text, /Reports of impersonation are kept/i, name);
        assert.doesNotMatch(text, /بلاغات الانتحال تُحفظ/, name);
      }
    });

    it("has no «hide card» action; the /u/ card is public while the account exists", () => {
      for (const { name, text } of all) {
        assert.doesNotMatch(text, /скрыть визитку|закрыть визитку/, name);
        assert.doesNotMatch(text, /hide card|hide the card/i, name);
        assert.doesNotMatch(text, /إخفاء البطاقة|تقفل البطاقة/, name);
      }
      for (const { name, text } of [...main, { name: "privacy.html", text: html }]) {
        assert.match(text, /self\.amrsys\.net\/u\/name\.amr/, name);
      }
      assert.match(main[0]!.text, /Пока аккаунт существует, ваша визитка открыта всем/);
      assert.match(main[0]!.text, /После удаления аккаунта визитка перестаёт открываться/);
    });
  });

  describe("feature claims match the code (full pass)", () => {
    const all = [...policies.map((p) => ({ name: p.name, text: p.text })), { name: "privacy.html", text: html }];
    const ru = policies.find((p) => p.name === "privacy-policy.ru.md")!.text;
    const en = policies.find((p) => p.name === "privacy-policy.en.md")!.text;
    const ar = policies.find((p) => p.name === "privacy-policy.ar.md")!.text;

    it("a) photo: no visibility setting, visible to everyone, only delete", () => {
      for (const { name, text } of all) {
        assert.doesNotMatch(text, /Настройки видимости каждого контакта и фото|Номер WhatsApp и фото по умолчанию скрыты/, name);
        assert.doesNotMatch(text, /Visibility for each contact and photo|WhatsApp number and photo are hidden by default/i, name);
        assert.doesNotMatch(text, /رقم واتساب والصورة مخفيان/, name);
      }
      assert.match(ru, /настройки видимости у фото нет, его можно только удалить/);
      assert.match(en, /the photo has no visibility setting, you can only delete it/);
      assert.match(ar, /ما لها إعداد إظهار، تقدر بس تحذفها/);
    });

    it("b) real delete button names instead of «удалить всё»", () => {
      for (const { name, text } of all) {
        assert.doesNotMatch(text, /удалить всё/i, name);
        assert.doesNotMatch(text, /delete everything/i, name);
        assert.doesNotMatch(text, /حذف الكل/, name);
      }
      assert.match(ru, /«Удалить мои данные»/);
      assert.match(ru, /«Удалить аккаунт»/);
      assert.match(en, /“Delete my data”/);
      assert.match(ar, /«حذف بياناتي»/);
    });

    it("c) no in-app complaint feature; messages come by email/Telegram", () => {
      for (const { name, text } of all) {
        assert.doesNotMatch(text, /Разбирать жалобы на подделку|разобрать жалобу/, name);
        assert.doesNotMatch(text, /Handling reports of impersonation|review a report/i, name);
        assert.doesNotMatch(text, /النظر في بلاغات الانتحال|النظر في بلاغ،/, name);
      }
      assert.match(ru, /которые нам присылают на почту или в Telegram/);
      assert.match(en, /send to our email or Telegram/);
    });

    it("d) example nick is name.amr", () => {
      for (const { name, text } of all) assert.doesNotMatch(text, /murad\.amr/i, name);
    });

    it("e) transfer basis does not claim unverified contracts", () => {
      for (const { name, text } of all) {
        assert.doesNotMatch(text, /договорным условиям|contractual data processing terms|شروطهم التعاقدية/i, name);
      }
      assert.match(ru, /провайдеры защищают данные по своим опубликованным правилам \(ссылки ниже\)/);
    });

    it("no other unbacked feature claims (codes, badges, snapshot, change log, print, key/secret)", () => {
      for (const { name, text } of all) {
        assert.doesNotMatch(text, /выдаёт Cloudflare Worker|выдаёт сервер \(Cloudflare Worker\)|issued by a Cloudflare Worker|issued by the server \(Cloudflare Worker\)/, name);
        assert.doesNotMatch(text, /OAuth2|OpenID/, name);
        assert.doesNotMatch(text, /слепок|snapshot|النسخة العامة للبطاقة/i, name);
        assert.doesNotMatch(text, /Журнал изменений|change log/i, name);
        assert.doesNotMatch(text, /распечатайте|print them|اطبعها/i, name);
        assert.doesNotMatch(text, /ключ или секрет|key or secret|المفتاح أو السر/i, name);
      }
      assert.match(ru, /Bazar получает внутренний номер вашего аккаунта, ник и имя для показа/);
      assert.match(ru, /последние 5 версий/);
      assert.match(ru, /действует 5 минут/);
    });
  });

  describe("SECURITY non-blockers", () => {
    const all = [...policies.map((p) => ({ name: p.name, text: p.text })), { name: "privacy.html", text: html }];
    const pick = (n: string) => policies.find((p) => p.name === n)!.text;

    it("names the Bazar display name (nick without .amr, no real name)", () => {
      assert.match(pick("privacy-policy.ru.md"), /имя для показа — это тот же ник без окончания \.amr/);
      assert.match(pick("privacy-policy.en.md"), /display name — the same nick without the \.amr ending/);
      assert.match(pick("privacy-policy.ar.md"), /اسم العرض/);
      assert.equal([...html.matchAll(/without the \.amr ending|без окончания \.amr|بدون النهاية \.amr/g)].length, 3);
    });

    it("does not reference a missing terms-of-service document", () => {
      for (const { name, text } of all) {
        assert.doesNotMatch(text, /условия сервиса|service terms|شروط الخدمة/i, name);
      }
    });

    it("says cached photo copies disappear within minutes", () => {
      assert.match(pick("privacy-policy.ru.md"), /После удаления фото его копии в кэше исчезают в течение нескольких минут/);
      assert.match(pick("privacy-policy.en.md"), /After you delete the photo, cached copies disappear within a few minutes/);
      assert.match(pick("privacy-policy.ar.md"), /بعد حذف الصورة نسخها المؤقتة تختفي خلال دقائق/);
    });
  });

  it("describes explicit consent for Health data in 3.5 and 4, in every language and on the page", () => {
    const need: Record<string, RegExp[]> = {
      "privacy-policy.ru.md": [/экран согласия/, /«Разрешить»/, /дата/, /«Отозвать согласие»/, /раздел очищается/, /явное согласие/, /«Удалить старые записи»/, /не уходят на сервер/, /резервной копии без согласия/, /новое устройство их не получит/],
      "privacy-policy.en.md": [/consent screen/, /“Allow”/, /date/, /“Withdraw consent”/, /section is cleared/, /explicit consent/, /“Delete old entries”/, /not sent to the server/, /backup without consent/, /a new device will not get them/],
      "privacy-policy.ar.md": [/شاشة موافقة/, /«أسمح»/, /تاريخ/, /«سحب الموافقة»/, /القسم ينمسح/, /موافقتك الصريحة/, /«احذف السجلات القديمة»/, /ما تنرسل للخادم/, /نسخة احتياطية بدون موافقة/],
      "privacy-policy.uz.md": [/rozilik ekranini/, /«Ruxsat berish»/, /sanasi/, /«Rozilikni qaytarib olish»/, /bo'lim tozalanadi/, /«Eski yozuvlarni o'chirish»/, /serverga yuborilmaydi/, /Zaxira nusxadan/],
      "privacy-policy.tj.md": [/экрани розигиро/, /«Иҷозат додан»/, /санаи/, /«Бозпас гирифтани розигӣ»/, /бахш тоза мешавад/, /«Нест кардани сабтҳои кӯҳна»/, /ба сервер фиристода намешаванд/, /нусхаи эҳтиётӣ/],
    };
    for (const [name, patterns] of Object.entries(need)) {
      const text = policies.find((p) => p.name === name)!.text;
      for (const re of patterns) assert.match(text, re, `${name} ${re}`);
    }
    for (const re of [/экран согласия/, /раздел очищается/, /consent screen/, /section is cleared/, /القسم ينمسح/, /bo&#x27;lim tozalanadi/, /бахш тоза мешавад/, /«Удалить старые записи»/, /“Delete old entries”/, /«احذف السجلات القديمة»/, /«Eski yozuvlarni o&#x27;chirish»/, /«Нест кардани сабтҳои кӯҳна»/]) {
      assert.match(html, re);
    }
  });
});
