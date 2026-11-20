import { encode } from "uqr";
import { cardBackground, type CardTheme, type PublicContact } from "@/lib/card/visibility.ts";
import type { Lang, MsgKey } from "@/lib/i18n.ts";
import { translate as tr } from "@/lib/i18n.ts";
import { useRef, useState } from "react";
import { useBackLayer } from "@/lib/back-stack.ts";
import { ServiceIcon, SiteIcon, serviceName } from "./contact-icons.tsx";

type PhotoSlot = "cover" | "avatar";

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
  avatar,
  name,
  onPickPhoto,
  onRemovePhoto,
  coverY = 50,
  onMoveCover,
  onPickBackground,
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
  /** Cover: background of the card header, the QR panel and the shared picture. */
  photo?: string | null;
  /** Round face photo, like WhatsApp Business. */
  avatar?: string | null;
  /** Name in any language, shown large above the nick. */
  name?: string;
  onPickPhoto?: (file: File, slot: PhotoSlot) => Promise<string> | void;
  onRemovePhoto?: (slot: PhotoSlot) => Promise<string> | void;
  /** Cover photo position, 0 (top) … 100 (bottom). */
  coverY?: number;
  /** Owner fixed a new cover position. */
  onMoveCover?: (y: number) => void;
  /** Owner wants to choose a ready background. */
  onPickBackground?: () => void;
}) {
  const t = (k: MsgKey) => tr(lang, k);
  // One panel at a time: share sheet or QR. The phone's Back gesture closes it.
  const [panel, setPanel] = useState<"" | "share" | "qr" | "cover" | "avatar">("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const edit = panel === "cover" || panel === "avatar" ? panel : null;
  async function pick(file: File, slot: PhotoSlot) {
    setPanel("");
    setBusy(true);
    setMsg("");
    const m = (await onPickPhoto?.(file, slot)) ?? "";
    setBusy(false);
    setMsg(m);
  }
  async function remove(slot: PhotoSlot) {
    setPanel("");
    setMsg((await onRemovePhoto?.(slot)) ?? "");
  }
  const shareOpen = panel === "share";
  const qr = panel === "qr";
  const togglePanel = (next: "share" | "qr" | "cover" | "avatar") => setPanel((p) => (p === next ? "" : next));
  const closePanel = () => setPanel("");
  useBackLayer(panel !== "", closePanel);
  const letter = ((name || nick).replace(/^@/, "").trim()[0] ?? "A").toUpperCase();
  // Background: a ready picture by occupation, or the owner's own cover photo.
  const preset = cardBackground(theme);
  const bg = preset ?? photo ?? null;
  const own = !preset && Boolean(photo);
  const [moving, setMoving] = useState(false);
  const [y, setY] = useState(coverY);
  const drag = useRef<{ start: number; y0: number; span: number } | null>(null);
  const shownY = moving ? y : coverY;
  function startMove() {
    setPanel("");
    setY(coverY);
    setMoving(true);
  }
  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!moving) return;
    const box = e.currentTarget.getBoundingClientRect();
    const img = e.currentTarget.querySelector("img");
    const rh = img && img.naturalWidth ? (box.width * img.naturalHeight) / img.naturalWidth : box.height;
    drag.current = { start: e.clientY, y0: y, span: Math.max(1, rh - box.height) };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!moving || !d) return;
    setY(Math.min(100, Math.max(0, Math.round(d.y0 - ((e.clientY - d.start) / d.span) * 100))));
  }
  return (
    <div className="idcard">
      <div className="idhead">
        <div
          className={`idbg${bg ? " has" : ""}${moving ? " moving" : ""}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          {bg ? <img src={bg} alt="" draggable={false} style={own ? { objectPosition: `center ${shownY}%` } : undefined} /> : null}
          {moving ? (
            <div className="idmove">
              <span>{t("bg_move_hint")}</span>
              <div>
                <button type="button" onClick={() => setMoving(false)}>{t("cancel")}</button>
                <button type="button" className="on" onClick={() => { setMoving(false); onMoveCover?.(y); }}>{t("bg_fix")}</button>
              </div>
            </div>
          ) : null}
          {onPickPhoto && !moving ? (
            <button type="button" className="idpen idpen-bg" aria-label={t("cover_photo")} onClick={() => togglePanel("cover")}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M13 7l4 4" stroke="currentColor" strokeWidth="1.8"/></svg></button>
          ) : null}
        </div>
        <div className="idava">
          {avatar ? <img src={avatar} alt="" /> : <span aria-hidden="true">{letter}</span>}
          {onPickPhoto ? (
            <button type="button" className="idpen idpen-ava" aria-label={t("face_photo")} onClick={() => togglePanel("avatar")}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M13 7l4 4" stroke="currentColor" strokeWidth="1.8"/></svg></button>
          ) : null}
        </div>
        {name ? <h1 className="idcard-name" dir="auto">{name}</h1> : null}
        {name ? <div className="idcard-nick-sm">{nick}</div> : <h1 className="idcard-nick">{nick}</h1>}
        <div className="idcard-sub">AMR ID</div>
        {busy ? <div className="idmsg">{t("photo_busy")}</div> : msg ? <div className="idmsg err" role="alert">{msg}</div> : null}
      </div>
      {edit ? (
        <>
          <div className="dim" onClick={closePanel} />
          <div className="sheet idshare-sheet" role="menu">
            <div className="handle" />
            <b className="sheet-title">{t(edit === "cover" ? "cover_photo" : "face_photo")}</b>
            {edit === "cover" && own && onMoveCover ? (
              <button type="button" role="menuitem" onClick={startMove}>{t("bg_move")}</button>
            ) : null}
            {edit === "cover" && onPickBackground ? (
              <button type="button" role="menuitem" onClick={() => { closePanel(); onPickBackground(); }}>{t("card_bg")}</button>
            ) : null}
            <label role="menuitem" className="sheet-item">
              {t("pick_photo")}
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pick(f, edit); }} />
            </label>
            {(edit === "cover" ? photo : avatar) ? (
              <button type="button" role="menuitem" className="danger" onClick={() => void remove(edit)}>{t("remove_photo")}</button>
            ) : null}
            <button type="button" role="menuitem" onClick={closePanel}>{t("cancel")}</button>
          </div>
        </>
      ) : null}
      <div className="idcard-links">
        {[...contacts].sort((a, b) => Number(b.kind === "phone") - Number(a.kind === "phone")).map((c) => {
          if (c.kind === "phone" && c.href) {
            return (
              <a key={c.id} className="idlink idcall" href={c.href}>
                <ServiceIcon kind="phone" size={44} />
                <span className="idlink-copy">
                  <b>{t("call")}</b>
                  <small dir="ltr">{c.display}</small>
                </span>
              </a>
            );
          }
          const body = (
            <>
              {c.kind === "website" ? <SiteIcon href={c.href} size={44} /> : <ServiceIcon kind={c.kind} size={44} />}
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
          <div className="idcard-actions">
            <button className={`idbtn primary${shareOpen ? " is-on" : ""}`} type="button" aria-expanded={shareOpen} aria-haspopup="menu" onClick={() => togglePanel("share")}>{t("share")}</button>
            <button className={`idbtn${qr ? " is-on" : ""}`} type="button" aria-pressed={qr} onClick={() => togglePanel("qr")}>{t("qr_code")}</button>
          </div>
          {shareOpen ? (
            <>
              <div className="dim" onClick={closePanel} />
              <div className="sheet idshare-sheet" role="menu">
                <div className="handle" />
                <button type="button" role="menuitem" onClick={() => { closePanel(); onShareLink?.(); }}>{t("share_link")}</button>
                <button type="button" role="menuitem" onClick={() => { closePanel(); onShareImage?.(); }}>{t("share_image")}</button>
                <button type="button" role="menuitem" onClick={() => { closePanel(); onVcard?.(); }}>{t("add_to_contacts")}</button>
              </div>
            </>
          ) : null}
        </>
      )}
      {qr ? (
        <div className={`idqr idqr-card${bg ? " has" : ""}`}>
          {bg ? <img className="idqr-bg" src={bg} alt="" style={own ? { objectPosition: `center ${coverY}%` } : undefined} /> : null}
          <div className="idqr-who">
            <span className="idqr-ava">{avatar ? <img src={avatar} alt="" /> : letter}</span>
            <b dir="auto">{name || nick}</b>
          </div>
          <div className="idqr-code"><QrMatrix value={url} label={nick} /></div>
        </div>
      ) : null}
      <div className="idcard-foot">AMR ID</div>
    </div>
  );
}
