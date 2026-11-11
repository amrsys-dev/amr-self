import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { SECURITY_HEADERS } from "./http.ts";

function assertNoPreload(hsts: string) {
  assert.match(hsts, /max-age=63072000/);
  assert.match(hsts, /includeSubDomains/);
  assert.equal(/preload/i.test(hsts), false);
}

describe("security headers", () => {
  it("sends HSTS without a preload directive", () => {
    assertNoPreload(SECURITY_HEADERS["Strict-Transport-Security"] ?? "");
  });

  it("omits preload from vercel.json HSTS", () => {
    const raw = JSON.parse(readFileSync(resolve("vercel.json"), "utf8")) as {
      headers?: { headers?: { key: string; value: string }[] }[];
    };
    const hsts =
      raw.headers
        ?.flatMap((entry) => entry.headers ?? [])
        .find((header) => header.key === "Strict-Transport-Security")?.value ?? "";
    assertNoPreload(hsts);
  });
});
