import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashLinkToken, newLinkToken, telegramDeepLink, telegramLinkKey, TELEGRAM_LINK_TTL_MS } from "./telegram-link.ts";

describe("telegram link tokens", () => {
  it("hashes a token and builds a start deep link that fits Telegram's 64-byte payload", async () => {
    const token = newLinkToken();
    assert.ok(token.length >= 16);
    assert.ok(token.length <= 64);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    const hash = await hashLinkToken(token);
    assert.equal(hash.length, 64);
    assert.notEqual(hash, token);
    assert.equal(await hashLinkToken(token), hash);
    const link = telegramDeepLink(token, "amr_id_bot");
    assert.equal(link, `https://t.me/amr_id_bot?start=${token}`);
    assert.equal(telegramLinkKey(hash), `tg-link:${hash}`);
    assert.equal(TELEGRAM_LINK_TTL_MS, 10 * 60_000);
  });
});
