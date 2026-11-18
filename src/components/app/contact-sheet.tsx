import { TestBanner } from "./ui.tsx";
import { ServiceIcon, serviceName } from "../contact-icons.tsx";
import type { App } from "./use-id-app.ts";
import type { ContactKind } from "@/lib/card/visibility.ts";
import { useState } from "react";

/** Most used first, in one row; the rest open under «Ещё». */
const MAIN_KINDS: ContactKind[] = ["phone", "whatsapp", "telegram", "imo", "instagram", "tiktok", "snapchat", "email"];
const MORE_KINDS: ContactKind[] = ["youtube", "x", "facebook", "linkedin", "boosty", "signal", "discord", "steam", "other"];

function placeholderFor(k: ContactKind): string {
  if (k === "telegram" || k === "instagram" || k === "tiktok" || k === "x" || k === "snapchat") return "@username";
  if (k === "whatsapp" || k === "phone") return "+966…";
  if (k === "boosty") return "boosty.to/name";
  if (k === "email") return "name@mail.com";
  if (k === "youtube") return "@channel";
  return "";
}

/** Bottom sheet for adding a contact. */
export function ContactSheet({ app }: { app: App }) {
  const { t, session, testOtp, sheet, setSheet, newKind, setNewKind, newValue, setNewValue, addContact } = app;
  const kindName = (k: typeof newKind) => serviceName(k, t);
  const [more, setMore] = useState(false);
  const pick = (k: ContactKind) => {
    setNewKind(k);
    setSheet("value");
  };
  const tile = (k: ContactKind) => (
    <button key={k} className={`svc${k === "phone" ? " svc-phone" : ""}`} type="button" onClick={() => pick(k)}>
      <ServiceIcon kind={k} size={46} />
      <span>{kindName(k)}</span>
    </button>
  );
  return (
    <>
    {sheet && session && (
      <>
        <div className="dim" onClick={() => setSheet(null)} />
        <div className="sheet">
          <div className="handle" />
          {sheet === "kind" && (
            <>
              <h2>{t("which_contact")}</h2>
              <div className="svc-grid">{MAIN_KINDS.map(tile)}</div>
              <button type="button" className={`svc-more${more ? " is-on" : ""}`} aria-expanded={more} onClick={() => setMore(!more)}>
                <span aria-hidden="true">{more ? "−" : "+"}</span> {t("more_services")}
              </button>
              {more ? <div className="svc-grid svc-grid-more">{MORE_KINDS.map(tile)}</div> : null}
            </>
          )}
          {sheet === "value" && (
            <>
              <h2><ServiceIcon kind={newKind} size={36} /> {kindName(newKind)}</h2>
              <div className="field">
                <div className="box">
                  <input value={newValue} onChange={(e) => setNewValue(e.target.value)} autoCapitalize="off" autoFocus aria-label={t("contact_value")} placeholder={placeholderFor(newKind)} />
                </div>
              </div>
              <p className="hint" style={{ marginTop: 10 }}>{t(`tip_${newKind}` as any)}</p>
              <TestBanner code={testOtp} t={t} />
              <div className="btns">
                <button className="btn p" type="button" onClick={() => void addContact()}>
                  {t("next")}
                </button>
              </div>
            </>
          )}
        </div>
      </>
    )}
    </>
  );
}
