import { encode } from "uqr";
import type { CardTheme, PublicContact } from "@/lib/card/visibility.ts";
import type { Lang, MsgKey } from "@/lib/i18n.ts";
import { translate as tr } from "@/lib/i18n.ts";
import { Ornament } from "./ornament.tsx";
import { useState, useEffect, useRef } from "react";
import { ServiceIcon, serviceName } from "./contact-icons.tsx";

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

/** What a visitor reads under the service name. The WhatsApp number is never shown. */
export function contactDetail(c: PublicContact, t: (k: MsgKey) => string): string {
  if (c.kind === "whatsapp") return t("write");
  return c.display || (c.action === "write" ? t("write") : t("open"));
}

/**
 * The digital card: one page in the owner's theme. Avatar, nick, then one button
 * per visible contact with its service icon; the page grows with the contacts.
 */
export function CardHero({
  nick,
  url,
  theme,
  contacts,
  lang,
  guest,
  onShareLink,
  onShareImage,
  onVcard,
  photo,
  onPickPhoto,
  onRemovePhoto,
}: {
  nick: string;
  url: string;
  theme: CardTheme;
  contacts: PublicContact[];
  lang: Lang;
  guest?: boolean;
  domain?: string;
  onShareLink?: () => void;
  onShareImage?: () => void;
  onVcard?: () => void;
  photo?: string | null;
  onPickPhoto?: (file: File) => void;
  onRemovePhoto?: () => void;
}) {
  const t = (k: MsgKey) => tr(lang, k);
  // One panel at a time: share menu or QR. Opening a panel adds a history step,
  // so the phone's Back gesture closes it instead of leaving the screen.
  const [panel, setPanel] = useState<"" | "share" | "qr">("");
  const shareOpen = panel === "share";
  const qr = panel === "qr";
  const actionsRef = useRef<HTMLDivElement>(null);
  const togglePanel = (next: "share" | "qr") => {
    if (panel === next) return closePanel();
    if (!panel) {
      try {
        history.pushState({ ...(history.state ?? {}), amrPanel: next }, "");
      } catch {
        /* ignore */
      }
    }
    setPanel(next);
  };
  const closePanel = () => {
    if (!panel) return;
    if ((history.state as { amrPanel?: string } | null)?.amrPanel) history.back();
    else setPanel("");
  };
  useEffect(() => {
    if (!panel) return;
    const onPop = () => setPanel("");
    const onDown = (e: PointerEvent) => {
      if (panel === "share" && actionsRef.current && !actionsRef.current.contains(e.target as Node)) closePanel();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);
  const letter = (nick.replace(/^@/, "")[0] ?? "A").toUpperCase();
  return (
    <div className="idcard">
      {photo ? (
        <div className="idcover">
          <img src={photo} alt="" />
          <div className="idcover-title">
            <h1 className="idcard-nick">{nick}</h1>
            <div className="idcard-sub">AMR ID</div>
          </div>
        </div>
      ) : (
        <>
          <div className="idcard-ava-wrap">
            <div className="idcard-ava" aria-hidden="true">{letter}</div>
            {onPickPhoto ? (
              <label className="idcover-pen" aria-label={t("add_photo")}>
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M13 7l4 4" stroke="currentColor" strokeWidth="1.8"/></svg>
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickPhoto(f); e.target.value = ""; }} />
              </label>
            ) : null}
          </div>
          <h1 className="idcard-nick">{nick}</h1>
          <div className="idcard-sub">AMR ID</div>
        </>
      )}
      {onPickPhoto ? (
        <label className="idcover-pen" aria-label={photo ? t("change_photo") : t("add_photo")}>
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M13 7l4 4" stroke="currentColor" strokeWidth="1.8"/></svg>
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickPhoto(f); e.target.value = ""; }} />
        </label>
      ) : null}
      <div className="idcard-links">
        {contacts.map((c) => {
          const body = (
            <>
              <ServiceIcon kind={c.kind} size={44} />
              <span className="idlink-copy">
                <b>{serviceName(c.kind, t)}</b>
                <small>{contactDetail(c, t)}</small>
              </span>
              <span className="idlink-chev" aria-hidden="true">›</span>
            </>
          );
          return c.href ? (
            <a key={c.id} className="idlink" href={c.href} target="_blank" rel="noreferrer">{body}</a>
          ) : (
            <div key={c.id} className="idlink">{body}</div>
          );
        })}
      </div>
      {guest ? (
        <div className="idcard-actions">
          <button className="idbtn primary" type="button" onClick={onVcard}>{t("save_contact")}</button>
        </div>
      ) : (
        <>
          <div className="idcard-actions" ref={actionsRef}>
            <button className={`idbtn primary${shareOpen ? " is-on" : ""}`} type="button" aria-expanded={shareOpen} aria-haspopup="menu" onClick={() => togglePanel("share")}>{t("share")}</button>
            <button className={`idbtn${qr ? " is-on" : ""}`} type="button" aria-pressed={qr} onClick={() => togglePanel("qr")}>{t("qr_code")}</button>
            {shareOpen ? (
              <div className="idpop" role="menu">
                <button type="button" role="menuitem" onClick={() => { closePanel(); onShareLink?.(); }}>{t("share_link")}</button>
                <button type="button" role="menuitem" onClick={() => { closePanel(); onShareImage?.(); }}>{t("share_image")}</button>
                <button type="button" role="menuitem" onClick={() => { closePanel(); onVcard?.(); }}>{t("add_to_contacts")}</button>
              </div>
            ) : null}
          </div>
        </>
      )}
      {qr ? <div className="idqr"><QrMatrix value={url} label={nick} /></div> : null}
      <div className="idcard-foot">AMR ID</div>
    </div>
  );
}
