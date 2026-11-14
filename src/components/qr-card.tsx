import { encode } from "uqr";
import type { CardTheme, PublicContact } from "@/lib/card/visibility.ts";
import type { Lang, MsgKey } from "@/lib/i18n.ts";
import { translate as tr } from "@/lib/i18n.ts";
import { Ornament } from "./ornament.tsx";

export function QrMatrix({ value, label }: { value: string; label?: string }) {
  const { data, size } = encode(value, { ecc: "M" });
  const cells: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y]![x]) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg" aria-label={label ?? "QR"}>
      <path d={cells.join(" ")} fill="currentColor" />
    </svg>
  );
}

export function QrStage({ url, theme, label }: { url: string; theme: CardTheme; label?: string }) {
  return (
    <div className="qrwrap">
      {theme !== "minimal" ? <div className="glow" /> : null}
      <Ornament theme={theme} />
      <div className="qrpad">
        <QrMatrix value={url} label={label} />
      </div>
    </div>
  );
}

const GLYPH: Record<string, string> = {
  telegram: "TG",
  whatsapp: "WA",
  signal: "SG",
  discord: "DC",
  steam: "ST",
  snapchat: "SN",
  youtube: "YT",
  email: "@",
  other: "+",
};

function ContactIcon({ kind }: { kind: string }) {
  if (kind === "telegram") return <svg className="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.7 3.2 18.4 20c-.2 1.2-.9 1.5-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6 13.5 1.1 12c-1.1-.3-1.1-1 .2-1.5L20.4 3c.9-.3 1.7.2 1.3 1.2Z"/></svg>;
  if (kind === "whatsapp") return <svg className="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" d="M20.3 11.7a8.3 8.3 0 0 1-12.2 7.4L3 20l1-4.8a8.3 8.3 0 1 1 16.3-3.5Z"/><path fill="currentColor" d="M9 7.8c-.3-.7-.6-.7-.9-.7h-.7c-.2 0-.6.1-.9.5s-1.2 1.2-1.2 2.8 1.2 3.2 1.4 3.4c.2.2 2.3 3.6 5.7 4.9 2.8 1.1 3.4.9 4 .8.6-.1 1.9-.8 2.2-1.6.3-.8.3-1.5.2-1.6-.1-.1-.3-.2-.7-.4l-2.1-1c-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.3-.7.1-.4-.2-1.6-.6-2.9-1.8-1.1-1-1.8-2.2-2-2.6-.2-.4 0-.5.2-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.6Z"/></svg>;
  if (kind === "youtube") return <svg className="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23 7.1a3 3 0 0 0-2.1-2.2C19 4.4 12 4.4 12 4.4s-7 0-8.9.5A3 3 0 0 0 1 7.1 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.9 3 3 0 0 0 2.1 2.2c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.2 31 31 0 0 0 .5-4.9 31 31 0 0 0-.5-4.9ZM9.7 15.6V8.4l6.2 3.6-6.2 3.6Z"/></svg>;
  if (kind === "email") return <svg className="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" d="M3 5.5h18v13H3z M3.5 6l8.5 7 8.5-7"/></svg>;
  return <svg className="contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="m9.5 14.5 5-5M8 17H6a4 4 0 0 1 0-8h4m4-2h4a4 4 0 0 1 0 8h-4"/></svg>;
}

export function CardHero({
  nick,
  url,
  theme,
  contacts,
  lang,
  guest,
  domain,
  onShare,
  onSave,
  onVcard,
}: {
  nick: string;
  url: string;
  theme: CardTheme;
  contacts: PublicContact[];
  lang: Lang;
  guest?: boolean;
  domain?: string;
  onShare?: () => void;
  onSave?: () => void;
  onVcard?: () => void;
}) {
  const t = (k: MsgKey) => tr(lang, k);
  return (
    <div className="cardhero">
      <div className="nick">{nick}</div>
      <QrStage url={url} theme={theme} label={nick} />
      {domain ? <div className="domain">{domain}</div> : null}
      {guest ? (
        <div className="cta-row">
          {contacts.map((c) =>
            c.href ? (
              <a key={c.id} className="cta" href={c.href} target="_blank" rel="noreferrer">
                <ContactIcon kind={c.kind} />
                {c.action === "write" ? t("write") : t("open")}
                {c.kind === "whatsapp" ? ` · ${t("listed_by_owner")}` : c.display ? ` · ${c.display}` : ""}
              </a>
            ) : null,
          )}
        </div>
      ) : (
        <>
          <div className="open-list">
            {contacts.map((c) => (
              <span key={c.id}>
                {GLYPH[c.kind] ?? "+"}
                {c.kind === "whatsapp" ? ` ${t("listed_by_owner")}` : c.display ? ` ${c.display}` : ""}
              </span>
            ))}
          </div>
          <div className="act-row">
            <button className="act" type="button" onClick={onShare}>
              <span>{t("share")}</span>
            </button>
            <button className="act" type="button" onClick={onSave}>
              <span>{t("save_image")}</span>
            </button>
            <button className="act" type="button" onClick={onVcard}>
              <span>{t("add_to_contacts")}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
