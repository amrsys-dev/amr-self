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
  | "rebind-2fa";

export type Meta = {
  testMode: boolean;
  storeKind: string;
  nickFormat: string;
  env: string;
  cardOrigin: string;
  emailOtp?: boolean;
  recoveryCodes?: number;
  telegramBot?: string;
};

export type SessionState = {
  nick: string;
  theme: CardTheme;
  appearance: "dark" | "light";
  contacts: Contact[];
  wrapPassword?: WrappedKey;
  kdf?: { password: KdfParams; recovery: KdfParams };
  cardPath: string;
  nickChanged?: boolean;
};

export const GLYPH: Record<ContactKind, string> = {
  telegram: "TG",
  whatsapp: "WA",
  signal: "SG",
  discord: "DC",
  steam: "ST",
  snapchat: "SN",
  email: "@",
  other: "+",
};
