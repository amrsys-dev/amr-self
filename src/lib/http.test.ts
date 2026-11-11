import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SECURITY_HEADERS } from "./http.ts";

describe("security headers", () => {
  it("sends HSTS without a preload directive", () => {
    const hsts = SECURITY_HEADERS["Strict-Transport-Security"] ?? "";
    assert.match(hsts, /max-age=63072000/);
    assert.match(hsts, /includeSubDomains/);
    assert.equal(/preload/i.test(hsts), false);
  });
});
