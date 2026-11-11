import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sanitizeTelegramRecord,
  telegramFromUserInput,
  telegramHasForbiddenFields,
  telegramPublicView,
} from "./telegram.ts";

describe("Telegram field minimization", () => {
  it("stores only a numeric id when the dest is a Telegram user id", () => {
    const stored = telegramFromUserInput("123456789");
    assert.deepEqual(stored, { id: "123456789", chatId: "123456789", verified: false });
    assert.equal("phone" in stored, false);
    assert.equal("photo" in stored, false);
    assert.equal("first_name" in stored, false);
  });

  it("stores a username only when the user supplied a public @username", () => {
    const stored = telegramFromUserInput("@omar.public");
    assert.deepEqual(stored, { username: "omar.public", verified: false });
  });

  it("strips phone, photo and names if they appear on an inbound payload", () => {
    const dirty = {
      id: "55500111",
      username: "omar",
      phone: "+966500000000",
      photo: "https://t.me/file/abc",
      first_name: "Omar",
      last_name: "Ali",
      verified: true,
    };
    assert.equal(telegramHasForbiddenFields(dirty), true);
    const clean = sanitizeTelegramRecord(dirty)!;
    assert.equal(clean.id, "55500111");
    assert.equal(clean.username, "omar");
    assert.equal(telegramHasForbiddenFields(clean), false);
    assert.equal("phone" in clean, false);
    assert.equal("photo" in clean, false);
    assert.equal("first_name" in clean, false);
    assert.equal("last_name" in clean, false);
    const view = telegramPublicView(clean)!;
    assert.deepEqual(view, { username: "omar", verified: true });
  });
});
