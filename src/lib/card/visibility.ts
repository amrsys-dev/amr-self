export const CONTACT_KINDS = [
  "telegram",
  "whatsapp",
  "signal",
  "discord",
  "steam",
  "snapchat",
  "imo",
  "youtube",
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

export type ContactAction = "write" | "open";

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
    case "email":
      // Only a plain address: no "?bcc=" or other mailto parameters.
      return EMAIL_RE.test(v) ? `mailto:${v}` : null;
    case "other":
      if (isHttpsUrl(v)) return v;
      return null;
  }
}

export function contactAction(kind: ContactKind): ContactAction {
  return WRITE_KINDS.has(kind) ? "write" : "open";
}

export function defaultContactVisible(kind: ContactKind): boolean {
  return kind !== "whatsapp";
}

export function displayContactValue(c: Contact, listedByOwner = ""): string {
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

export const CARD_THEMES = ["graphite", "gothic", "tactic", "minimal", "orbit", "malachite"] as const;
export type CardTheme = (typeof CARD_THEMES)[number];

export function parseCardTheme(raw: string | null | undefined): CardTheme {
  const v = (raw ?? "").toLowerCase();
  return (CARD_THEMES as readonly string[]).includes(v) ? (v as CardTheme) : "graphite";
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
