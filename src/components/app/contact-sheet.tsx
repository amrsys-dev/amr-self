import { TestBanner } from "./ui.tsx";
import { ServiceIcon, serviceName } from "../contact-icons.tsx";
import type { App } from "./use-id-app.ts";

/** Bottom sheet for adding a contact. */
export function ContactSheet({ app }: { app: App }) {
  const { t, session, testOtp, sheet, setSheet, newKind, setNewKind, newValue, setNewValue, addContact } = app;
  const kindName = (k: typeof newKind) => serviceName(k, t);
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
              <div className="svc-grid">
                {(["telegram", "whatsapp", "signal", "discord", "steam", "snapchat", "youtube", "email", "other"] as const).map((k) => (
                  <button
                    key={k}
                    className="svc"
                    type="button"
                    onClick={() => {
                      setNewKind(k);
                      setSheet("value");
                    }}
                  >
                    <ServiceIcon kind={k} size={46} />
                    <span>{kindName(k)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {sheet === "value" && (
            <>
              <h2><ServiceIcon kind={newKind} size={36} /> {kindName(newKind)}</h2>
              <div className="field">
                <div className="box">
                  <input value={newValue} onChange={(e) => setNewValue(e.target.value)} autoCapitalize="off" autoFocus aria-label={t("contact_value")} placeholder={newKind === "telegram" ? "@username" : newKind === "whatsapp" ? "+966…" : newKind === "email" ? "name@mail.com" : ""} />
                </div>
              </div>
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
