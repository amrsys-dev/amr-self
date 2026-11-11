export const CONTACT_KINDS = [
  "telegram",
  "whatsapp",
  "signal",
  "discord",
  "steam",
  "snapchat",
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

export function contactHref(c: Contact): string | null {
  const v = c.value.trim();
  if (!v) return null;
  switch (c.kind) {
    case "telegram":
      return `https://t.me/${v.replace(/^@/, "")}`;
    case "whatsapp":
      return `https://wa.me/${v.replace(/[^\d]/g, "")}`;
    case "signal":
      return `https://signal.me/#u/${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "discord":
      return `https://discord.com/users/${encodeURIComponent(v)}`;
    case "steam":
      return `https://steamcommunity.com/id/${encodeURIComponent(v)}`;
    case "snapchat":
      return `https://www.snapchat.com/add/${encodeURIComponent(v)}`;
    case "email":
      return `mailto:${v}`;
    case "other":
      if (/^https?:\/\//i.test(v)) return v;
      return null;
  }
}

export function contactAction(kind: ContactKind): ContactAction {
  return WRITE_KINDS.has(kind) ? "write" : "open";
}

export function displayContactValue(c: Contact): string {
  if (c.kind === "whatsapp") return "";
  if (c.kind === "telegram" || c.kind === "signal") {
    return c.value.startsWith("@") ? c.value : `@${c.value}`;
  }
  return c.label || c.value;
}

export function toPublicContacts(contacts: readonly Contact[]): PublicContact[] {
  return visibleContacts(contacts).map((c) => ({
    id: c.id,
    kind: c.kind,
    href: contactHref(c),
    action: contactAction(c.kind),
    display: displayContactValue(c),
    verified: c.verified,
  }));
}

export const CARD_THEMES = ["graphite", "gothic", "tactic", "minimal", "orbit", "malachite"] as const;
export type CardTheme = (typeof CARD_THEMES)[number];

export function parseCardTheme(raw: string | null | undefined): CardTheme {
  const v = (raw ?? "").toLowerCase();
  return (CARD_THEMES as readonly string[]).includes(v) ? (v as CardTheme) : "graphite";
}
