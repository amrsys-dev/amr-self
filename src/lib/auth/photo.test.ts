import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PHOTO_CACHE_CONTROL, avatarUrl, photoSlot, photoType, photoUrl } from "./photo.ts";

describe("card photo", () => {
  it("accepts only JPEG and WebP bytes", () => {
    assert.equal(photoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    assert.equal(photoType(webp), "image/webp");
    assert.equal(photoType(new TextEncoder().encode("<svg onload=x>")), null);
  });
  it("versions the public URL so a new photo is not served from cache", () => {
    assert.equal(photoUrl({ nick: "name.amr", photo: { key: "k", v: 7 } }), "/api/card-photo/name.amr?v=7");
    assert.equal(photoUrl({ nick: "name.amr" }), null);
  });
  it("uses a short cache so a deleted photo disappears within minutes", () => {
    assert.equal(PHOTO_CACHE_CONTROL, "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
    assert.doesNotMatch(PHOTO_CACHE_CONTROL, /immutable|86400/);
  });
  it("avatar has its own URL and slot", () => {
    assert.equal(avatarUrl({ nick: "name.amr", avatar: { key: "a", v: 3 } }), "/api/card-photo/name.amr?slot=avatar&v=3");
    assert.equal(avatarUrl({ nick: "name.amr" }), null);
    assert.equal(photoSlot("avatar"), "avatar");
    assert.equal(photoSlot("x"), "cover");
    assert.equal(photoSlot(null), "cover");
  });
});
