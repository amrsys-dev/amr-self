import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { photoType, photoUrl } from "./photo.ts";

describe("card photo", () => {
  it("accepts only JPEG and WebP bytes", () => {
    assert.equal(photoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    assert.equal(photoType(webp), "image/webp");
    assert.equal(photoType(new TextEncoder().encode("<svg onload=x>")), null);
  });
  it("versions the public URL so a new photo is not served from cache", () => {
    assert.equal(photoUrl({ nick: "murad.amr", photo: { key: "k", v: 7 } }), "/api/card-photo/murad.amr?v=7");
    assert.equal(photoUrl({ nick: "murad.amr" }), null);
  });
});
