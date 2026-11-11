/**
 * OTP relay for AMR ID. Not deployed in stage 1.
 * The Vercel app will call this worker instead of talking to Telegram / Resend itself.
 */

import { routeDo } from "./do.ts";
export { AmrIdDo } from "./do.ts";

type Env = {
  OTP_RELAY_SECRET: string;
  TG_OTP_BOT_TOKEN?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  CF_DO_SECRET?: string;
  AMR_ID?: DurableObjectNamespace;
};

type Body = {
  channel: "telegram" | "email";
  to: string;
  text: string;
  code?: string;
};

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "amr-id-otp-relay" });
    }
    if (url.pathname === "/v1/do") {
      return routeDo(request, env as Env & { CF_DO_SECRET: string });
    }
    if (request.method !== "POST" || url.pathname !== "/send") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!env.OTP_RELAY_SECRET || token !== env.OTP_RELAY_SECRET) return unauthorized();
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    if (!body?.channel || !body.to || !body.text) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    if (body.channel === "telegram") {
      if (!env.TG_OTP_BOT_TOKEN) return Response.json({ error: "telegram_unconfigured" }, { status: 503 });
      const res = await fetch(`https://api.telegram.org/bot${env.TG_OTP_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: body.to, text: body.text }),
      });
      return Response.json({ ok: res.ok, provider: "telegram" }, { status: res.ok ? 200 : 502 });
    }
    if (!env.RESEND_API_KEY) return Response.json({ error: "email_unconfigured" }, { status: 503 });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.RESEND_FROM ?? "AMR ID <noreply@example.com>",
        to: [body.to],
        subject: "AMR ID",
        text: body.text,
      }),
    });
    return Response.json({ ok: res.ok, provider: "email" }, { status: res.ok ? 200 : 502 });
  },
};
