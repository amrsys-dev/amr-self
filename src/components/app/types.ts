import type { CardTheme, Contact, ContactKind } from "@/lib/card/visibility.ts";
import type { KdfParams, WrappedKey } from "@/lib/crypto.ts";

export type Screen =
  | "welcome"
  | "signup-nick"
  | "signup-pass"
  | "signup-2fa"
  | "signup-code"
  | "signup-tg-link"
  | "signup-done"
  | "login"
  | "login-2fa"
  | "login-tg-link"
  | "recovery"
  | "recovery-done"
  | "today"
  | "finance"
  | "work"
  | "more"
  | "profile"
  | "visa"
  | "diary"
  | "sport"
  | "plans"
  | "card"
  | "card-themes"
  | "sec-2fa-change"
  | "account-delete"
  | "nick-change"
  | "rebind-2fa"
  | "google-link";

export type Meta = {
  testMode: boolean;
  storeKind: string;
  nickFormat: string;
  env: string;
  cardOrigin: string;
  emailOtp?: boolean;
  recoveryCodes?: number;
  telegramBot?: string;
  googleLogin?: boolean;
};

export type SessionState = {
  nick: string;
  dataId?: string;
  /** Card cover photo URL, if the owner added one. */
  photo?: string | null;
  /** Round face photo URL (the cover is `photo`). */
  avatar?: string | null;
  /** Name on the card in any language. */
  displayName?: string;
  theme: CardTheme;
  coverY?: number;
  /** Phone number on the card pictures (default on). */
  imagePhone?: boolean;
  appearance: "dark" | "light";
  contacts: Contact[];
  googleLinked?: boolean;
  wrapPassword?: WrappedKey;
  kdf?: { password: KdfParams; recovery: KdfParams };
  cardPath: string;
  nickChanged?: boolean;
};

export const GLYPH: Record<ContactKind, string> = {
  phone: "☎",
  boosty: "B",
  website: "WWW",
  telegram: "TG",
  whatsapp: "WA",
  signal: "SG",
  discord: "DC",
  steam: "ST",
  snapchat: "SN",
  youtube: "YT",
  email: "@",
  imo: "IM",
  instagram: "IG",
  tiktok: "TT",
  x: "X",
  facebook: "FB",
  linkedin: "in",
  other: "+",
};

/** Id that encrypted data is bound to. Stays the same after a nick change. */
export function accountIdOf(s: SessionState): string {
  return s.dataId ?? s.nick;
}
