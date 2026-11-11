import { isTestMode, env, readDoConfig } from "../env.server.ts";
import type { OtpChannel } from "../user.ts";

export type OtpSendInput = {
  channel: OtpChannel;
  to: string;
  code: string;
  lang?: string;
};

export type OtpSendResult = {
  delivered: boolean;
  provider: "test" | "telegram" | "email" | "relay" | "none";
  /** Present only in test mode — never set when the Telegram worker is live or VERCEL_ENV=production. */
  testCode?: string;
  retryAfterMs?: number;
};

const MSG = {
  ru: (code: string) => `Код AMR ID: ${code}. Никому не говорите этот код.`,
  en: (code: string) => `AMR ID code: ${code}. Do not share this code.`,
  ar: (code: string) => `رمز AMR ID: ${code}. لا تشارك هذا الرمز.`,
  uz: (code: string) => `AMR ID kodi: ${code}. Bu kodni hech kimga aytmang.`,
  tj: (code: string) => `Рамзи AMR ID: ${code}. Ин рамзро ба касе нагӯед.`,
};

function text(lang: string | undefined, code: string): string {
  const k = (lang ?? "ru") as keyof typeof MSG;
  return (MSG[k] ?? MSG.ru)(code);
}

export async function sendOtp(input: OtpSendInput): Promise<OtpSendResult> {
  if (isTestMode()) {
    console.info(`[AMR ID TEST] OTP for ${input.channel}:${input.to} = ${input.code}`);
    return { delivered: true, provider: "test", testCode: input.code };
  }

  const doCfg = readDoConfig();
  const relay = env("OTP_RELAY_URL") ?? doCfg?.url;
  const relaySecret = env("OTP_RELAY_SECRET") ?? doCfg?.secret;
  if (input.channel === "telegram" && relay && relaySecret) {
    const res = await fetch(`${relay.replace(/\/$/, "")}/v1/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${relaySecret}` },
      body: JSON.stringify({ chatId: input.to, lang: input.lang, text: text(input.lang, input.code) }),
      cache: "no-store",
    });
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as { retryAfterMs?: number };
      return { delivered: false, provider: "relay", retryAfterMs: body.retryAfterMs };
    }
    if (!res.ok) return { delivered: false, provider: "relay" };
    return { delivered: true, provider: "relay" };
  }

  if (input.channel === "telegram") {
    // Direct Telegram from the app is disabled — the bot token stays on the worker.
    return { delivered: false, provider: "none" };
  }

  const key = env("RESEND_API_KEY");
  const from = env("RESEND_FROM") ?? "AMR ID <noreply@example.com>";
  if (!key) return { delivered: false, provider: "none" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "AMR ID",
      text: text(input.lang, input.code),
    }),
  });
  return { delivered: res.ok, provider: "email" };
}
