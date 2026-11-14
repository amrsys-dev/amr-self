/** Human-chosen AMR handles. New handles are canonicalized to @name.amr. */

export type NickFormat = {
  prefix: string;
  groups: number[];
  alphabet: string;
};

const PREFIX = "AMR";
const DIGITS = "0123456789";
const LEGACY_PATTERN = /^@?AMR-\d{3,8}(?:-\d{3,8})+$/i;
const HANDLE_PATTERN = /^(?=.{3,24}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;

export function parseNickFormat(spec?: string): NickFormat {
  const raw = (spec ?? defaultNickFormatSpec()).trim().toLowerCase();
  const parts = raw.split("-").filter(Boolean);
  if (parts.length < 1 || parts.some((p) => !/^x+$/.test(p))) throw new Error("invalid nick format");
  if (parts.some((p) => p.length < 2 || p.length > 8)) throw new Error("invalid nick format");
  return { prefix: PREFIX, groups: parts.map((p) => p.length), alphabet: DIGITS };
}

export function defaultNickFormatSpec(): string {
  if (typeof process !== "undefined" && process.env?.AMR_NICK_FORMAT) return process.env.AMR_NICK_FORMAT;
  return "xxx-xxx";
}

export function nickPattern(_fmt: NickFormat): RegExp {
  return /^@?[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?(?:\.amr|@amr)?$/i;
}

export function normalizeNick(raw: string, _fmt: NickFormat = parseNickFormat()): string | null {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return null;

  // Preserve the old machine-generated IDs so existing accounts can still log in.
  if (LEGACY_PATTERN.test(trimmed)) return `@${trimmed.replace(/^@/, "").toUpperCase()}`;

  let handle = trimmed.replace(/^@/, "");
  handle = handle.replace(/(?:\.amr|@amr)$/i, "");
  if (!HANDLE_PATTERN.test(handle)) return null;
  const reserved = new Set(["admin", "root", "system", "amr", "support", "help", "test", "null", "undefined", "api", "login", "signup", "u"]);
  if (reserved.has(handle.toLowerCase())) return null;
  return `@${handle.toLowerCase()}.amr`;
}

export function generateNick(
  _fmt: NickFormat = parseNickFormat(),
  rnd: (arr: Uint8Array) => Uint8Array = (arr) => crypto.getRandomValues(arr),
): string {
  const bytes = rnd(new Uint8Array(5));
  const suffix = Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  return `@member-${suffix}.amr`;
}

export function nickWithoutAt(nick: string): string {
  return nick.startsWith("@") ? nick.slice(1) : nick;
}

export function publicCardPath(nick: string): string {
  return `/u/${nickWithoutAt(nick)}`;
}

export const RESERVED_NICKS = new Set(
  ["admin", "root", "system", "amr", "support", "help", "test", "null", "undefined", "api", "login", "signup", "u"].map((s) => s.toLowerCase()),
);
