/** Configurable AMR nick: default @AMR-xxx-xxx, can switch to @AMR-xxxx-xxxx. */

export type NickFormat = {
  prefix: string;
  groups: number[];
  alphabet: string;
};

const PREFIX = "AMR";
const DIGITS = "0123456789";

export function parseNickFormat(spec?: string): NickFormat {
  const raw = (spec ?? defaultNickFormatSpec()).trim().toLowerCase();
  const parts = raw.split("-").filter(Boolean);
  if (parts.length < 1 || parts.some((p) => !/^x+$/.test(p))) {
    throw new Error("invalid nick format");
  }
  if (parts.some((p) => p.length < 2 || p.length > 8)) {
    throw new Error("invalid nick format");
  }
  return { prefix: PREFIX, groups: parts.map((p) => p.length), alphabet: DIGITS };
}

export function defaultNickFormatSpec(): string {
  if (typeof process !== "undefined" && process.env?.AMR_NICK_FORMAT) {
    return process.env.AMR_NICK_FORMAT;
  }
  return "xxx-xxx";
}

export function nickPattern(fmt: NickFormat): RegExp {
  const body = fmt.groups.map((n) => `\\d{${n}}`).join("-");
  return new RegExp(`^@?${fmt.prefix}-${body}$`, "i");
}

export function normalizeNick(raw: string, fmt: NickFormat = parseNickFormat()): string | null {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return null;
  const withAt = trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  if (!nickPattern(fmt).test(withAt)) return null;
  const digits = withAt.replace(/^@/i, "").split("-").slice(1).join("-");
  return `@${fmt.prefix}-${digits}`;
}

export function generateNick(
  fmt: NickFormat = parseNickFormat(),
  rnd: (arr: Uint8Array) => Uint8Array = (arr) => crypto.getRandomValues(arr),
): string {
  const parts = fmt.groups.map((n) => {
    const bytes = rnd(new Uint8Array(n));
    return Array.from(bytes, (b) => fmt.alphabet[b % fmt.alphabet.length]).join("");
  });
  return `@${fmt.prefix}-${parts.join("-")}`;
}

export function nickWithoutAt(nick: string): string {
  return nick.startsWith("@") ? nick.slice(1) : nick;
}

export function publicCardPath(nick: string): string {
  return `/u/${nickWithoutAt(nick)}`;
}

export const RESERVED_NICKS = new Set(
  [
    "admin",
    "root",
    "system",
    "amr",
    "support",
    "help",
    "test",
    "null",
    "undefined",
    "api",
    "login",
    "signup",
    "u",
  ].map((s) => s.toLowerCase()),
);
