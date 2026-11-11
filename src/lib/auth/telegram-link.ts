/** One-time Telegram bot deep-link tokens. Raw tokens are never stored. */

export const TELEGRAM_LINK_TTL_MS = 10 * 60_000;
export const DEFAULT_TG_BOT = "amr_id_bot";

export type TelegramLinkPurpose = "signup" | "login" | "rebind";

export type TelegramLinkRecord = {
  nick: string;
  purpose: TelegramLinkPurpose;
  pendingOtpId?: string;
  lang?: string;
  exp: number;
  linked?: boolean;
  chatId?: string;
  username?: string;
  claimed?: boolean;
};

export function telegramBotUsername(): string {
  const raw = (typeof process !== "undefined" ? process.env?.AMR_TG_BOT : undefined)?.trim().replace(/^@/, "");
  return raw || DEFAULT_TG_BOT;
}

export function telegramDeepLink(token: string, bot = telegramBotUsername()): string {
  return `https://t.me/${bot}?start=${encodeURIComponent(token)}`;
}

export function telegramLinkKey(hash: string): string {
  return `tg-link:${hash}`;
}

export async function hashLinkToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newLinkToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function linkRecordLive(rec: TelegramLinkRecord, now = Date.now()): boolean {
  return rec.exp > now;
}
