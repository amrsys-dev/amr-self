import type { KdfParams, WrappedKey } from "./crypto.ts";
import type { CardTheme, Contact } from "./card/visibility.ts";
import type { TelegramStored } from "./telegram.ts";

export type OtpChannel = "telegram" | "email";

export type UsedRecovery = { hash: string; until: number };

export type UserRecord = {
  nick: string;
  /** Stable encryption identity; unlike nick, this never changes. */
  dataId?: string;
  /** Card cover photo blob (random key, survives a nick change). */
  photo?: { key: string; v: number; type?: string };
  /** Name shown on the card, any language (e.g. full Arabic or Cyrillic name). Public. */
  displayName?: string;
  createdAt: string;
  /** Hash of the client-derived auth key (never a raw password). */
  passwordHash: string;
  /** Hash of the client-derived recovery verify key (never the raw code). */
  recoveryHash: string;
  /** Unused one-time recovery hashes (includes recoveryHash). Each code can be used once. */
  recoveryHashes?: string[];
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
  /** One wrap per unused recovery code, same order as recoveryHashes. */
  wrapRecoveries?: WrappedKey[];
  /** Per-code argon2id params (salt is unique to that recovery code). */
  recoveryKdfs?: KdfParams[];
  appearance: "dark" | "light";
  dataVersion?: number;
  /** Nick may be changed exactly once. After that the old nick stays reserved. */
  nickChanged?: boolean;
  previousNick?: string;
  ageConfirmedAt?: string;
  /** «Войти через Google» linked to this nick (only while signed in to it). */
  google?: { sub: string; linkedAt: string };
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
