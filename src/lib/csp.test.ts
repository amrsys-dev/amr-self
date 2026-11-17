import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS, json } from "./http.ts";

const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const vercelCsp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key.toLowerCase() === "content-security-policy")?.value;
const directive = (csp: string, name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `));

describe("Content-Security-Policy", () => {
  it("vercel.json and http.ts send the same policy", () => {
    assert.ok(vercelCsp);
    assert.equal(vercelCsp, CONTENT_SECURITY_POLICY);
    assert.equal(SECURITY_HEADERS["Content-Security-Policy"], CONTENT_SECURITY_POLICY);
    assert.equal(json({}).headers.get("content-security-policy"), CONTENT_SECURITY_POLICY);
  });
  it("form-action allows only this app and Google sign-in", () => {
    for (const csp of [vercelCsp!, CONTENT_SECURITY_POLICY]) {
      assert.equal(directive(csp, "form-action"), "form-action 'self' https://accounts.google.com");
      assert.equal(directive(csp, "frame-ancestors"), "frame-ancestors 'none'");
      assert.equal(directive(csp, "connect-src"), "connect-src 'self'");
    }
  });
});
