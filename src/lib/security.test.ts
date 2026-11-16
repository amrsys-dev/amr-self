import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactHref, EMAIL_RE } from "./card/visibility.ts";
import { buildVcard } from "./card/vcard.ts";

const c = (kind: Parameters<typeof contactHref>[0]["kind"], value: string) => ({ id: "x", kind, value, visible: true, verified: false });

describe("contact links cannot be abused", () => {
  it("mailto only for a plain address (no ?bcc= or headers)", () => {
    assert.equal(contactHref(c("email", "a@b.co")), "mailto:a@b.co");
    assert.equal(contactHref(c("email", "a@b.co?bcc=x@y.z")), null);
    assert.equal(contactHref(c("email", "not an email")), null);
    assert.ok(!EMAIL_RE.test("a@b.co\r\nBcc: x@y.z"));
  });
  it("usernames are encoded into the link path", () => {
    assert.equal(contactHref(c("telegram", "@a/../b?x=1")), "https://t.me/a%2F..%2Fb%3Fx%3D1");
    assert.equal(contactHref(c("other", "javascript:alert(1)")), null);
    assert.equal(contactHref(c("other", "http://plain.example")), null);
  });
  it("vCard fields cannot inject new lines", () => {
    const v = buildVcard({ nick: "a\r\nEMAIL:evil@x.y", url: "", contacts: [] });
    assert.ok(!/\r\nEMAIL:evil/.test(v));
  });
});

describe("signed-in changes only from this site", async () => {
  const { crossSiteRejected } = await import("./auth/session.ts");
  const req = (method: string, headers: Record<string, string>) => new Request("https://self.amrsys.net/api/me", { method, headers });
  it("allows reads and same-site changes", () => {
    assert.equal(crossSiteRejected(req("GET", { origin: "https://evil.example" })), false);
    assert.equal(crossSiteRejected(req("POST", { host: "self.amrsys.net", origin: "https://self.amrsys.net" })), false);
    assert.equal(crossSiteRejected(req("PUT", { host: "self.amrsys.net" })), false);
  });
  it("blocks changes from another site", () => {
    assert.equal(crossSiteRejected(req("POST", { host: "self.amrsys.net", origin: "https://evil.example" })), true);
    assert.equal(crossSiteRejected(req("DELETE", { host: "self.amrsys.net", "sec-fetch-site": "cross-site" })), true);
  });
});
