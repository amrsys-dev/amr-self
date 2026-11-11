import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readCloudflareConfig } from "./cloudflare.ts";

describe("cloudflare config", () => {
  it("enables KV without an R2 bucket", () => {
    const prev = {
      CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
      CF_API_TOKEN: process.env.CF_API_TOKEN,
      CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID,
      CF_R2_BUCKET: process.env.CF_R2_BUCKET,
    };
    process.env.CF_ACCOUNT_ID = "acct";
    process.env.CF_API_TOKEN = "token";
    process.env.CF_KV_NAMESPACE_ID = "kv";
    delete process.env.CF_R2_BUCKET;
    try {
      const cfg = readCloudflareConfig();
      assert.ok(cfg);
      assert.equal(cfg?.kvNamespaceId, "kv");
      assert.equal(cfg?.r2Bucket, undefined);
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v == null) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
