import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isTestMode, telegramOtpLive } from "./env.server.ts";

const KEYS = ["VERCEL_ENV", "OTP_MODE", "CF_DO_URL", "CF_DO_SECRET", "OTP_RELAY_URL", "OTP_RELAY_SECRET", "TG_OTP_BOT_TOKEN", "RESEND_API_KEY"];

function clear(): void {
  for (const k of KEYS) delete process.env[k];
}

describe("isTestMode", () => {
  afterEach(clear);

  it("stays on for local tests when OTP_MODE=test and no relay is configured", () => {
    clear();
    process.env.OTP_MODE = "test";
    assert.equal(telegramOtpLive(), false);
    assert.equal(isTestMode(), true);
  });

  it("never echoes codes when the Durable Object worker relay is configured", () => {
    clear();
    process.env.OTP_MODE = "test";
    process.env.CF_DO_URL = "https://amr-id-do-preview.example.workers.dev";
    process.env.CF_DO_SECRET = "preview-do-secret-value";
    assert.equal(telegramOtpLive(), true);
    assert.equal(isTestMode(), false);
  });

  it("is always off in production", () => {
    clear();
    process.env.VERCEL_ENV = "production";
    process.env.OTP_MODE = "test";
    assert.equal(isTestMode(), false);
  });
});
