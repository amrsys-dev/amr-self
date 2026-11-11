import { isTestMode, env } from "../env.server.ts";
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
  /** Present only in test mode — never set when VERCEL_ENV=production. */
  testCode?: string;
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

  const relay = env("OTP_RELAY_URL");
  const relaySecret = env("OTP_RELAY_SECRET");
  if (relay && relaySecret) {
    const res = await fetch(`${relay.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${relaySecret}` },
      body: JSON.stringify({ ...input, text: text(input.lang, input.code) }),
    });
    if (!res.ok) return { delivered: false, provider: "relay" };
    return { delivered: true, provider: "relay" };
  }

  if (input.channel === "telegram") {
    const token = env("TG_OTP_BOT_TOKEN");
    if (!token) return { delivered: false, provider: "none" };
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: input.to, text: text(input.lang, input.code) }),
    });
    return { delivered: res.ok, provider: "telegram" };
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
