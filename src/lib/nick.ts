/** Human-chosen AMR handles. New handles are canonicalized to name.amr. */

export type NickFormat = {
  prefix: string;
  groups: number[];
  alphabet: string;
};

const PREFIX = "AMR";
const DIGITS = "0123456789";
const LEGACY_PATTERN = /^@?AMR-\d{3,8}(?:-\d{3,8})+$/i;
const HANDLE_PATTERN = /^(?=.{3,32}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;

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
  return /^@?[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\.amr|@amr)?$/i;
}

export function normalizeNick(raw: string, _fmt: NickFormat = parseNickFormat()): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Preserve the old machine-generated IDs so existing accounts can still log in.
  if (LEGACY_PATTERN.test(trimmed)) return `@${trimmed.replace(/^@/, "").toUpperCase()}`;

  let handle = trimmed.replace(/^@/, "");
  handle = handle.replace(/(?:\.amr|@amr)$/i, "");
  if (!HANDLE_PATTERN.test(handle)) return null;
  if (isReservedHandle(handle)) return null;
  return `${handle.toLowerCase()}.amr`;
}

export function generateNick(
  _fmt: NickFormat = parseNickFormat(),
  rnd: (arr: Uint8Array) => Uint8Array = (arr) => crypto.getRandomValues(arr),
): string {
  const bytes = rnd(new Uint8Array(5));
  const suffix = Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  return `member-${suffix}.amr`;
}

export function nickWithoutAt(nick: string): string {
  return nick.replace(/^@/, "");
}

export function publicCardPath(nick: string): string {
  return `/u/${nickWithoutAt(nick)}`;
}

export const RESERVED_NICKS = new Set(
  [
    "admin", "root", "system", "amr", "support", "help", "test", "null", "undefined", "api", "login", "signup", "u",
    // 26.11.2026 (Мурад): служебные имена и названия приложений AMR никто не может занять
    "owner", "staff", "team", "official", "security", "billing", "pay", "payment", "service", "info", "contact", "bot",
    "amrsys", "amr-id", "amrid", "self", "safar", "hostel", "bazar", "cut", "amr-cut", "3design", "vision", "panel",
  ].map((s) => s.toLowerCase()),
);

/** Начала ников, которые выдают себя за администрацию: admin1, admin-amr, system.bot, support24, moderator… */
const RESERVED_PREFIX = /^(admin|administrator|system|sysadmin|support|moderator|official|root|superuser)/;

/** Служебное слово или похожее на него имя - занять нельзя. */
export function isReservedHandle(handle: string): boolean {
  const h = handle.toLowerCase();
  return RESERVED_NICKS.has(h) || RESERVED_PREFIX.test(h);
}

/** Why a typed nick cannot be used: wrong format or a reserved service word. null = fine. */
export function nickProblem(raw: string): "format" | "reserved" | null {
  const handle = raw.trim().replace(/^@/, "").replace(/(?:\.amr|@amr)$/i, "");
  if (LEGACY_PATTERN.test(raw.trim())) return null;
  if (!HANDLE_PATTERN.test(handle)) return "format";
  if (isReservedHandle(handle)) return "reserved";
  return null;
}
