import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildVcard, vcardFileName } from "./vcard.ts";

describe("vcard", () => {
  const v = buildVcard({
    nick: "name.amr",
    url: "https://self.example/u/name.amr",
    contacts: [
      { id: "1", kind: "telegram", href: "https://t.me/amr_userb", action: "write", display: "@amr_userb", verified: true },
      { id: "2", kind: "whatsapp", href: "https://wa.me/966500000000", action: "write", display: "", verified: false },
      { id: "3", kind: "email", href: "mailto:a@b.co", action: "write", display: "a@b.co", verified: false },
      { id: "4", kind: "other", href: null, action: "open", display: "x", verified: false },
    ],
  });

  it("names the contact by nick and links the card", () => {
    assert.match(v, /^BEGIN:VCARD\r\nVERSION:3\.0\r\nFN:name\.amr\r\n/);
    assert.match(v, /URL;TYPE=AMR ID:https:\/\/self\.example\/u\/name\.amr/);
  });
  it("turns contacts into phone, email and profile fields", () => {
    assert.match(v, /TEL;TYPE=CELL:\+966500000000/);
    assert.match(v, /EMAIL;TYPE=INTERNET:a@b\.co/);
    assert.match(v, /URL;TYPE=Telegram:https:\/\/t\.me\/amr_userb/);
    assert.doesNotMatch(v, /TYPE=Other/);
    assert.match(v, /END:VCARD\r\n$/);
  });
  it("makes a safe file name", () => {
    assert.equal(vcardFileName("@name.amr"), "name.amr.vcf");
  });
});
