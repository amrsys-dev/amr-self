/**
 * Telegram OTP bot (@amr_id_bot) webhook and send endpoint.
 * The bot token never leaves this worker.
 */
import { dispatchCoordinator } from "./do.ts";
import { handleGateway, type GatewayEnv } from "./gateway.ts";
import { hashLinkToken, telegramLinkKey, type TelegramLinkRecord } from "../../src/lib/auth/telegram-link.ts";
import { isTelegramUserId, sanitizeTelegramRecord } from "../../src/lib/telegram.ts";
import { nickKey, otpKey, type UserRecord } from "../../src/lib/user.ts";

export type TelegramWorkerEnv = GatewayEnv & {
  TG_OTP_BOT_TOKEN?: string;
  TG_WEBHOOK_SECRET?: string;
};

const OTP_WINDOW_MS = 15 * 60_000;
const OTP_MAX = 5;

const REPLIES: Record<string, { linked: string; expired: string; start: string; help: string }> = {
  ru: {
    linked: "AMR ID привязан. Вернитесь в приложение.",
    expired: "Ссылка устарела. Откройте её снова в приложении.",
    start: "Откройте ссылку из приложения AMR ID.",
    help: "Коды входа приходят сюда. Ссылку берите в приложении AMR ID.",
  },
  en: {
    linked: "AMR ID is linked. Return to the app.",
    expired: "The link expired. Open it again from the app.",
    start: "Open the link from the AMR ID app.",
    help: "Login codes arrive here. Get the link in the AMR ID app.",
  },
  ar: {
    linked: "تم ربط AMR ID. ارجع إلى التطبيق.",
    expired: "انتهى الرابط. افتحه من التطبيق مرة أخرى.",
    start: "افتح الرابط من تطبيق AMR ID.",
    help: "رموز الدخول تصل هنا. خذ الرابط من تطبيق AMR ID.",
  },
  uz: {
    linked: "AMR ID ulandi. Ilovaga qayting.",
    expired: "Havola eskirdi. Uni ilovadan qayta oching.",
    start: "Havolani AMR ID ilovasidan oching.",
    help: "Kirish kodlari shu yerga keladi. Havola — AMR ID ilovasida.",
  },
  tj: {
    linked: "AMR ID пайваст шуд. Ба барнома баргардед.",
    expired: "Пайванд кӯҳна шуд. Онро аз барнома аз нав кушоед.",
    start: "Пайвандро аз барномаи AMR ID кушоед.",
    help: "Рамзҳои вуруд ба ин ҷо меоянд. Пайванд дар барномаи AMR ID аст.",
  },
};

function pickLang(code: string | undefined): keyof typeof REPLIES {
  const c = (code ?? "en").slice(0, 2).toLowerCase();
  if (c in REPLIES) return c as keyof typeof REPLIES;
  return "en";
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function sendTelegram(env: TelegramWorkerEnv, chatId: string, text: string): Promise<boolean> {
  if (!env.TG_OTP_BOT_TOKEN) return false;
  const res = await fetch(`https://api.telegram.org/bot${env.TG_OTP_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return res.ok;
}

export async function handleOtpSend(request: Request, env: TelegramWorkerEnv): Promise<Response> {
  let body: { chatId?: string; text?: string; lang?: string };
  try {
    body = (await request.json()) as { chatId?: string; text?: string; lang?: string };
  } catch {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const chatId = (body.chatId ?? "").trim();
  if (!isTelegramUserId(chatId) || !body.text) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  if (!env.TG_OTP_BOT_TOKEN) return Response.json({ ok: false, error: "telegram_unconfigured" }, { status: 503 });
  const rate = await dispatchCoordinator(env, {
    op: "ratelimit",
    key: `otp-send:${chatId}`,
    windowMs: OTP_WINDOW_MS,
    max: OTP_MAX,
  });
  if (!rate.rate?.ok) {
    return Response.json({ ok: false, error: "rate_limited", retryAfterMs: rate.rate?.retryAfterMs ?? OTP_WINDOW_MS }, { status: 429 });
  }
  const sent = await sendTelegram(env, chatId, body.text);
  if (!sent) return Response.json({ ok: false, error: "telegram_send_failed" }, { status: 502 });
  return Response.json({ ok: true });
}

type PendingSignup = {
  kind?: string;
  user?: UserRecord;
  dest?: string;
};

export async function handleTelegramWebhook(request: Request, env: TelegramWorkerEnv): Promise<Response> {
  const header = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!env.TG_WEBHOOK_SECRET || !safeEqual(header, env.TG_WEBHOOK_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let update: {
    message?: {
      text?: string;
      chat?: { id?: number };
      from?: { username?: string; language_code?: string };
    };
  };
  try {
    update = (await request.json()) as typeof update;
  } catch {
    return new Response("ok");
  }
  const message = update.message;
  const text = (message?.text ?? "").trim();
  const chatId = message?.chat?.id != null ? String(message.chat.id) : "";
  const lang = pickLang(message?.from?.language_code);
  const copy = REPLIES[lang];
  if (!chatId || !isTelegramUserId(chatId)) return new Response("ok");

  if (text === "/help" || text.startsWith("/help@")) {
    await sendTelegram(env, chatId, copy.help);
    return new Response("ok");
  }
  if (!text.startsWith("/start")) {
    await sendTelegram(env, chatId, copy.start);
    return new Response("ok");
  }
  const payload = text.split(/\s+/, 2)[1]?.trim() ?? "";
  if (!payload) {
    await sendTelegram(env, chatId, copy.start);
    return new Response("ok");
  }

  const hash = await hashLinkToken(payload);
  const key = telegramLinkKey(hash);
  const got = await handleGateway({ op: "get", key }, env);
  if (!got.value) {
    await sendTelegram(env, chatId, copy.expired);
    return new Response("ok");
  }
  let rec: TelegramLinkRecord;
  try {
    rec = JSON.parse(got.value) as TelegramLinkRecord;
  } catch {
    await sendTelegram(env, chatId, copy.expired);
    return new Response("ok");
  }
  if (rec.exp <= Date.now()) {
    await handleGateway({ op: "delete", key }, env);
    await sendTelegram(env, chatId, copy.expired);
    return new Response("ok");
  }

  const username = message?.from?.username?.replace(/^@/, "");
  const tg = sanitizeTelegramRecord({ id: chatId, chatId, username, verified: true }) ?? {
    id: chatId,
    chatId,
    username,
    verified: true,
  };
  tg.verified = true;
  tg.chatId = chatId;
  tg.id = chatId;

  if (rec.pendingOtpId) {
    const pendingRaw = await handleGateway({ op: "get", key: otpKey(rec.pendingOtpId) }, env);
    if (pendingRaw.value) {
      const pending = JSON.parse(pendingRaw.value) as PendingSignup;
      if (pending.user) {
        pending.user.otp = pending.user.otp ?? {};
        pending.user.otp.telegram = tg;
        await handleGateway({ op: "put", key: otpKey(rec.pendingOtpId), value: JSON.stringify(pending) }, env);
      }
    }
  }

  const userRaw = await handleGateway({ op: "get", key: nickKey(rec.nick) }, env);
  if (userRaw.value) {
    const user = JSON.parse(userRaw.value) as UserRecord;
    user.otp = user.otp ?? {};
    user.otp.telegram = { ...(user.otp.telegram ?? {}), ...tg, verified: true };
    await handleGateway({ op: "put", key: nickKey(rec.nick), value: JSON.stringify(user) }, env);
  }

  rec.linked = true;
  rec.chatId = chatId;
  rec.username = username;
  await handleGateway({ op: "put", key, value: JSON.stringify(rec), opts: { expirationTtl: Math.max(60, Math.ceil((rec.exp - Date.now()) / 1000)) } }, env);
  await sendTelegram(env, chatId, copy.linked);
  return new Response("ok");
}
