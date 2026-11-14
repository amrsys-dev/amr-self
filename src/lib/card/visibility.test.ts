import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultContactVisible, isHttpsUrl, toPublicContacts, type Contact } from "./visibility.ts";

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
      c({ id: "6", kind: "youtube", value: "https://www.youtube.com/@omar" }),
    ];
    const pub = toPublicContacts(contacts, "указан владельцем");
    assert.deepEqual(
      pub.map((x) => x.kind),
      ["telegram", "whatsapp", "email", "discord", "youtube"],
    );
    const wa = pub.find((x) => x.kind === "whatsapp")!;
    assert.equal(wa.display, "указан владельцем");
    assert.equal(wa.href, "https://wa.me/966501112233");
    assert.equal(wa.action, "write");
    assert.equal(pub.find((x) => x.kind === "telegram")?.href, "https://t.me/omar.example");
    assert.equal(pub.find((x) => x.kind === "email")?.href, "mailto:hello@example.com");
    assert.equal(pub.find((x) => x.kind === "discord")?.action, "open");
    assert.equal(pub.find((x) => x.kind === "youtube")?.href, "https://www.youtube.com/@omar");
    assert.equal(pub.find((x) => x.kind === "youtube")?.display, "YouTube");
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

  it("allows only https URLs for kind=other", () => {
    assert.equal(isHttpsUrl("https://example.com/x"), true);
    assert.equal(isHttpsUrl("http://example.com/x"), false);
    assert.equal(isHttpsUrl("javascript:alert(1)"), false);
    assert.equal(isHttpsUrl("example.com"), false);
    const pub = toPublicContacts([
      c({ id: "o", kind: "other", value: "https://example.com/me" }),
    ]);
    assert.equal(pub[0]?.href, "https://example.com/me");
  });
});
