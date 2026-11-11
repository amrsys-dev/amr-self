/** Telegram field minimization: store only user id and a public username. Never phone or photo. */

export type TelegramStored = {
  id?: string;
  username?: string;
  /** Alias used as the OTP destination when a chat id is known. */
  chatId?: string;
  verified: boolean;
};

const FORBIDDEN = [
  "phone",
  "phone_number",
  "photo",
  "photo_url",
  "photoUrl",
  "first_name",
  "last_name",
  "firstName",
  "lastName",
  "language_code",
  "is_premium",
] as const;

export function isTelegramUserId(value: string): boolean {
  return /^\d{5,}$/.test(value.trim());
}

/** Build the stored Telegram record from a user-supplied destination (id or public @username). */
export function telegramFromUserInput(dest: string, verified = false): TelegramStored {
  const v = dest.trim();
  if (!v) return { verified };
  if (isTelegramUserId(v)) return { id: v, chatId: v, verified };
  const username = v.replace(/^@/, "");
  return username ? { username, verified } : { verified };
}

export function sanitizeTelegramRecord(raw: unknown): TelegramStored | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const out: TelegramStored = { verified: Boolean(rec.verified) };
  const id = typeof rec.id === "string" ? rec.id : typeof rec.chatId === "string" ? rec.chatId : undefined;
  if (id && isTelegramUserId(id)) {
    out.id = id;
    out.chatId = id;
  }
  if (typeof rec.username === "string" && rec.username.trim()) {
    out.username = rec.username.trim().replace(/^@/, "");
  }
  for (const key of FORBIDDEN) {
    if (key in rec) {
      /* dropped */
    }
  }
  return out;
}

export function telegramHasForbiddenFields(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const rec = raw as Record<string, unknown>;
  return FORBIDDEN.some((k) => k in rec && rec[k] != null && rec[k] !== "");
}

export function telegramPublicView(tg: TelegramStored | undefined): { username?: string; verified: boolean } | undefined {
  if (!tg) return undefined;
  return { username: tg.username, verified: tg.verified };
}
