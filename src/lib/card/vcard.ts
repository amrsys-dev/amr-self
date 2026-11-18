/**
 * vCard 3.0 for "Save contact": the nick as the name, the card link, and every
 * visible contact as a field the phone's contacts app understands.
 */
import type { PublicContact } from "./visibility.ts";

const esc = (v: string) => v.replace(/\r/g, "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

export function buildVcard(card: { nick: string; name?: string; url: string; contacts: readonly PublicContact[] }): string {
  const fn = card.name?.trim() || card.nick;
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(fn)}`, `N:${esc(fn)};;;;`, `NICKNAME:${esc(card.nick)}`];
  if (card.url) lines.push(`URL;TYPE=AMR ID:${card.url}`);
  for (const c of card.contacts) {
    if (!c.href) continue;
    if (c.kind === "phone") {
      lines.push(`TEL;TYPE=CELL:${c.href.replace(/^tel:/, "")}`);
    } else if (c.kind === "website") {
      lines.push(`URL:${c.href}`);
    } else if (c.kind === "email") {
      lines.push(`EMAIL;TYPE=INTERNET:${c.href.replace(/^mailto:/, "")}`);
    } else if (c.kind === "whatsapp") {
      const digits = c.href.replace(/^https:\/\/wa\.me\//, "").replace(/\D/g, "");
      if (digits) lines.push(`TEL;TYPE=CELL:+${digits}`);
      lines.push(`URL;TYPE=WhatsApp:${c.href}`);
    } else {
      const type = c.kind.charAt(0).toUpperCase() + c.kind.slice(1);
      lines.push(`URL;TYPE=${type}:${c.href}`);
      lines.push(`X-SOCIALPROFILE;TYPE=${c.kind}:${c.href}`);
    }
  }
  lines.push("NOTE:AMR ID", "END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

export function vcardFileName(nick: string): string {
  return nick.replace(/^@/, "").replace(/[^\w.-]+/g, "_") + ".vcf";
}
