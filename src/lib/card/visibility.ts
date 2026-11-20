export const CONTACT_KINDS = [
  "phone",
  "telegram",
  "whatsapp",
  "signal",
  "discord",
  "steam",
  "snapchat",
  "imo",
  "instagram",
  "tiktok",
  "x",
  "facebook",
  "linkedin",
  "youtube",
  "boosty",
  "website",
  "email",
  "other",
] as const;

export type ContactKind = (typeof CONTACT_KINDS)[number];

export type Contact = {
  id: string;
  kind: ContactKind;
  value: string;
  visible: boolean;
  verified: boolean;
  label?: string;
};

export type ContactAction = "write" | "open" | "call";

export type PublicContact = {
  id: string;
  kind: ContactKind;
  href: string | null;
  action: ContactAction;
  /** WhatsApp number is never shown. */
  display: string;
  verified: boolean;
};

export const WRITE_KINDS: ReadonlySet<ContactKind> = new Set([
  "telegram",
  "whatsapp",
  "signal",
  "email",
]);

export function visibleContacts(contacts: readonly Contact[]): Contact[] {
  return contacts.filter((c) => c.visible);
}

/** A plain e-mail address (no spaces, no mailto parameters). */
export const EMAIL_RE = /^[^\s@?&#<>"']{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,24}$/i;

export function contactHref(c: Contact): string | null {
  const v = c.value.trim();
  if (!v) return null;
  switch (c.kind) {
    case "phone": {
      // tel: link with digits only (and a leading +)
      const digits = v.replace(/[^\d]/g, "");
      if (digits.length < 6 || digits.length > 15) return null;
      return `tel:${v.trim().startsWith("+") ? "+" : ""}${digits}`;
    }
    case "website": {
      // Always https; the address must have a domain with a dot.
      const bare = v.replace(/^https?:\/\//i, "");
      const href = `https://${bare}`;
      return /^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]\S*)?$/i.test(bare) && isHttpsUrl(href) ? href : null;
    }
    case "boosty":
      if (/^https:\/\/(?:www\.)?boosty\.to\//i.test(v)) return v;
      return `https://boosty.to/${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "telegram":
      if (/^https:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i.test(v)) return v;
      return `https://t.me/${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "whatsapp":
      if (/^https:\/\/(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(v)) return v;
      // The number is used only in the link; it is not printed on the card.
      return `https://wa.me/${v.replace(/[^\d]/g, "")}`;
    case "youtube":
      if (/^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(v)) return v;
      return `https://www.youtube.com/@${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "signal":
      return `https://signal.me/#u/${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "discord":
      return `https://discord.com/users/${encodeURIComponent(v)}`;
    case "steam":
      return `https://steamcommunity.com/id/${encodeURIComponent(v)}`;
    case "snapchat":
      return `https://www.snapchat.com/add/${encodeURIComponent(v)}`;
    case "imo":
      return v.startsWith("http") ? v : `https://imo.im/${encodeURIComponent(v)}`;
    case "instagram":
      if (/^https:\/\/(?:www\.)?instagram\.com\//i.test(v)) return v;
      return `https://instagram.com/${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "tiktok":
      if (/^https:\/\/(?:www\.)?tiktok\.com\//i.test(v)) return v;
      return `https://www.tiktok.com/@${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "x":
      if (/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(v)) return v;
      return `https://x.com/${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "facebook":
      if (/^https:\/\/(?:www\.)?facebook\.com\//i.test(v)) return v;
      return `https://facebook.com/${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "linkedin":
      if (/^https:\/\/(?:www\.)?linkedin\.com\//i.test(v)) return v;
      return `https://www.linkedin.com/in/${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "email":
      // Only a plain address: no "?bcc=" or other mailto parameters.
      return EMAIL_RE.test(v) ? `mailto:${v}` : null;
    case "other":
      if (isHttpsUrl(v)) return v;
      return null;
  }
}

export function contactAction(kind: ContactKind): ContactAction {
  if (kind === "phone") return "call";
  return WRITE_KINDS.has(kind) ? "write" : "open";
}

export function defaultContactVisible(kind: ContactKind): boolean {
  return kind !== "whatsapp";
}

export function displayContactValue(c: Contact, listedByOwner = ""): string {
  if (c.kind === "website") return c.value.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (c.kind === "phone") return c.value.trim().replace(/[^\d+ ()-]/g, "");
  if (c.kind === "whatsapp") return listedByOwner;
  if (c.kind === "youtube") return c.label || "YouTube";
  if (c.kind === "telegram" || c.kind === "signal") {
    return c.value.startsWith("@") ? c.value : `@${c.value}`;
  }
  return c.label || c.value;
}

export function toPublicContacts(contacts: readonly Contact[], listedByOwner = ""): PublicContact[] {
  return visibleContacts(contacts).map((c) => ({
    id: c.id,
    kind: c.kind,
    href: contactHref(c),
    action: contactAction(c.kind),
    display: displayContactValue(c, listedByOwner),
    verified: c.verified,
  }));
}

/**
 * Card background: "own" = the owner's cover photo; the rest are ready pictures by occupation.
 * The card itself follows the owner's dark/light setting — no colour schemes.
 */
export const CARD_THEMES = ["own", "business", "owner", "taxi", "gamer", "blogger", "craft", "sew", "bakery"] as const;
export type CardTheme = (typeof CARD_THEMES)[number];

/** Old colour themes (before backgrounds) → the nearest background. */
const LEGACY_THEME: Record<string, CardTheme> = { malachite: "business", gothic: "owner", tactic: "gamer", orbit: "gamer", soft: "sew" };

export function parseCardTheme(raw: string | null | undefined): CardTheme {
  const v = (raw ?? "").toLowerCase();
  if ((CARD_THEMES as readonly string[]).includes(v)) return v as CardTheme;
  return LEGACY_THEME[v] ?? "own";
}

/** Picture of a ready background (null for "own"). */
export function cardBackground(theme: CardTheme): string | null {
  return theme === "own" ? null : `/cards/${theme}.svg`;
}

/** Vertical position of the cover photo, 0 (top) … 100 (bottom); 50 = centre. */
export function clampCoverY(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50;
}

/** Contact kind=other may only be an https URL. */
export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:";
  } catch {
    return false;
  }
}
