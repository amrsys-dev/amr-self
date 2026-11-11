import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultContactVisible, toPublicContacts, type Contact } from "./visibility.ts";

function c(partial: Partial<Contact> & Pick<Contact, "id" | "kind" | "value">): Contact {
  return { visible: true, verified: true, ...partial };
}

describe("public card visibility", () => {
  it("drops hidden contacts and never shows a WhatsApp number", () => {
    const contacts: Contact[] = [
      c({ id: "1", kind: "telegram", value: "omar.example" }),
      c({ id: "2", kind: "whatsapp", value: "+966501112233" }),
      c({ id: "3", kind: "snapchat", value: "omar.example", visible: false }),
      c({ id: "4", kind: "email", value: "hello@example.com" }),
      c({ id: "5", kind: "discord", value: "omar" }),
    ];
    const pub = toPublicContacts(contacts, "указан владельцем");
    assert.deepEqual(
      pub.map((x) => x.kind),
      ["telegram", "whatsapp", "email", "discord"],
    );
    const wa = pub.find((x) => x.kind === "whatsapp")!;
    assert.equal(wa.display, "указан владельцем");
    assert.equal(wa.href, "https://wa.me/966501112233");
    assert.equal(wa.action, "write");
    assert.equal(pub.find((x) => x.kind === "telegram")?.href, "https://t.me/omar.example");
    assert.equal(pub.find((x) => x.kind === "email")?.href, "mailto:hello@example.com");
    assert.equal(pub.find((x) => x.kind === "discord")?.action, "open");
    assert.equal(pub.some((x) => x.kind === "snapchat"), false);
    assert.equal(wa.display.includes("966"), false);
    assert.equal(wa.display.includes("501112233"), false);
  });

  it("keeps WhatsApp hidden by default so it does not appear on the card", () => {
    assert.equal(defaultContactVisible("whatsapp"), false);
    assert.equal(defaultContactVisible("telegram"), true);
    const hidden: Contact = {
      id: "w",
      kind: "whatsapp",
      value: "+966501112233",
      visible: defaultContactVisible("whatsapp"),
      verified: true,
    };
    const pub = toPublicContacts([hidden], "listed by the owner");
    assert.equal(pub.length, 0);
  });
});
