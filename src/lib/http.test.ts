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

describe("JSON answers are private by default", () => {
  it("sends Cache-Control: private, no-store and Vary: Cookie unless a route opts into public caching", async () => {
    const { json } = await import("./http.ts");
    const r = json({ nick: "name.amr" });
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    assert.equal(r.headers.get("vary"), "Cookie");
    const pub = json({}, 200, { "cache-control": "public, max-age=30, s-maxage=30" });
    assert.equal(pub.headers.get("cache-control"), "public, max-age=30, s-maxage=30");
    assert.equal(pub.headers.get("vary"), null);
    assert.equal(r.headers.get("x-frame-options"), "DENY");
  });
});

describe("unauthorized answers are not cached either", () => {
  it("requireUser 401/403 go out private, no-store", async () => {
    const { requireUser } = await import("./auth/session.ts");
    const r = (await requireUser(new Request("https://self.amrsys.net/api/me"))) as Response;
    assert.equal(r.status, 401);
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    const f = (await requireUser(new Request("https://self.amrsys.net/api/me", { method: "POST", headers: { origin: "https://evil.example", host: "self.amrsys.net" } }))) as Response;
    assert.equal(f.status, 403);
    assert.equal(f.headers.get("cache-control"), "private, no-store");
  });
});
