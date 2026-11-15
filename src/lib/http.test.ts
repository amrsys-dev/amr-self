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

  it("allows TanStack Start inline hydration scripts in CSP", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"] ?? "";
    assert.match(csp, /script-src 'self' 'unsafe-inline'/);
    // hash-wasm (argon2id for passwords) compiles WebAssembly in the browser.
    assert.match(csp, /'wasm-unsafe-eval'/);
    assert.doesNotMatch(csp, /script-src 'self';/);

    const raw = JSON.parse(readFileSync(resolve("vercel.json"), "utf8")) as {
      headers?: { headers?: { key: string; value: string }[] }[];
    };
    const vercelCsp =
      raw.headers
        ?.flatMap((entry) => entry.headers ?? [])
        .find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    assert.equal(vercelCsp, csp);
  });
});
