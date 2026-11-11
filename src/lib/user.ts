import type { WrappedKey } from "./crypto.ts";
import type { CardTheme, Contact } from "./card/visibility.ts";

export type OtpChannel = "telegram" | "email";

export type UserRecord = {
  nick: string;
  createdAt: string;
  passwordHash: string;
  recoveryHash: string;
  otp: {
    telegram?: { username?: string; chatId?: string; verified: boolean };
    email?: { address: string; verified: boolean };
  };
  contacts: Contact[];
  theme: CardTheme;
  wrapPassword: WrappedKey;
  wrapRecovery: WrappedKey;
  appearance: "dark" | "light";
};

export function nickKey(nick: string): string {
  return `nick:${nick.toLowerCase()}`;
}

export function sessionKey(id: string): string {
  return `session:${id}`;
}

export function otpKey(id: string): string {
  return `otp:${id}`;
}

export function dataBlobKey(nick: string): string {
  return `user/${nick.replace(/^@/, "")}/data`;
}
