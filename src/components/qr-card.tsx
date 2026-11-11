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
  email: "@",
  other: "+",
};

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
                <span className="glyph">{GLYPH[c.kind] ?? "+"}</span>
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
