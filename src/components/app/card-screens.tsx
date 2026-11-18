import { Header } from "./ui.tsx";
import { CardHero } from "../qr-card.tsx";
import { CARD_THEMES } from "@/lib/card/visibility.ts";
import { type MsgKey } from "@/lib/i18n.ts";
import type { App } from "./use-id-app.ts";

/** Business card and its theme picker. */
export function CardScreens({ app }: { app: App }) {
  const { lang, t, screen, setScreen, session, origin, cardUrl, publicContacts, saveProfile, shareCard, shareCardImage, saveVcard, uploadPhoto, removePhoto } = app;
  return (
    <>
    {session && screen === "card" && (
      <>
        <Header title={t("card")} onBack={() => setScreen("profile")} tool={<button className="tool" type="button" onClick={() => setScreen("card-themes")}>⋯</button>} />
        <div className={`page skin-page skin-${session.theme}`}>
          <CardHero
            nick={session.nick}
            name={session.displayName}
            url={cardUrl}
            theme={session.theme}
            contacts={publicContacts}
            lang={lang}
            domain={origin.replace(/^https?:\/\//, "")}
            onShareLink={shareCard}
            onShareImage={() => void shareCardImage()}
            onVcard={saveVcard}
            photo={session.photo}
            onPickPhoto={(f) => void uploadPhoto(f)}
            onRemovePhoto={() => void removePhoto()}
          />
        </div>
      </>
    )}

    {session && screen === "card-themes" && (
      <>
        <Header title={t("card_theme")} onBack={() => setScreen("card")} />
        <div className="page">
          <div className="thum-grid">
            {CARD_THEMES.map((th) => (
              <button
                key={th}
                type="button"
                className={`thum ${session.theme === th ? "on" : ""}`}
                onClick={() => void saveProfile({ theme: th })}
              >
                <div className={`thum-prev skin-mini-${th}`}>
                  <b>{session.nick}</b>
                </div>
                <div className="thum-name">{t(`theme_${th}` as MsgKey)}</div>
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 16, textAlign: "center" }}>Выбери стиль. Потом добавь контакты — WhatsApp, Telegram, Instagram и другие.</p>
        </div>
      </>
    )}
    </>
  );
}
