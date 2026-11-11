import type { KdfParams, WrappedKey } from "./crypto.ts";
import type { CardTheme, Contact } from "./card/visibility.ts";
import type { TelegramStored } from "./telegram.ts";

export type OtpChannel = "telegram" | "email";

export type UsedRecovery = { hash: string; until: number };

export type UserRecord = {
  nick: string;
  createdAt: string;
  /** Hash of the client-derived auth key (never a raw password). */
  passwordHash: string;
  /** Hash of the client-derived recovery verify key (never the raw code). */
  recoveryHash: string;
  usedRecoveryHashes?: UsedRecovery[];
  kdf: { password: KdfParams; recovery: KdfParams };
  otp: {
    telegram?: TelegramStored;
    email?: { address: string; verified: boolean };
  };
  contacts: Contact[];
  theme: CardTheme;
  wrapPassword: WrappedKey;
  wrapRecovery: WrappedKey;
  appearance: "dark" | "light";
  dataVersion?: number;
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

export function dataVersionBlobKey(nick: string, version: number): string {
  return `user/${nick.replace(/^@/, "")}/data/v/${version}`;
}

export function dataVersionKey(nick: string): string {
  return `user/${nick.replace(/^@/, "")}/data-version`;
}

export function sessionsOfKey(nick: string): string {
  return `sessions-of:${nick.toLowerCase()}`;
}

export function otpIndexKey(nick: string): string {
  return `otps-of:${nick.toLowerCase()}`;
}

export const DATA_VERSIONS_KEPT = 5;
