import { Header } from "./ui.tsx";
import { CardHero } from "../qr-card.tsx";
import { CARD_THEMES, cardBackground } from "@/lib/card/visibility.ts";
import { type MsgKey } from "@/lib/i18n.ts";
import type { App } from "./use-id-app.ts";

/** Business card and its background picker: own photo or a ready picture by occupation. */
export function CardScreens({ app }: { app: App }) {
  const { lang, t, screen, setScreen, session, origin, cardUrl, publicContacts, saveProfile, shareCard, shareCardImage, saveVcard, uploadPhoto, removePhoto } = app;
  return (
    <>
    {session && screen === "card" && (
      <>
        <Header title={t("card")} onBack={() => setScreen("profile")} />
        <div className="page">
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
            avatar={session.avatar}
            onPickPhoto={(f, slot) => uploadPhoto(f, slot)}
            onRemovePhoto={(slot) => removePhoto(slot)}
            coverY={session.coverY}
            onMoveCover={(y) => void saveProfile({ coverY: y })}
            onPickBackground={() => setScreen("card-themes")}
          />
          <div className="group">
            <div className="card pad0 set-list">
              <div className="set-row">
                <span className="set-label">{t("img_phone")}</span>
                <button
                  className={`toggle ${session.imagePhone !== false ? "on" : ""}`}
                  type="button"
                  role="switch"
                  aria-checked={session.imagePhone !== false}
                  aria-label={t("img_phone")}
                  onClick={() => void saveProfile({ imagePhone: session.imagePhone === false })}
                >
                  <i />
                </button>
              </div>
            </div>
            <p className="hint">{t("img_phone_hint")}</p>
          </div>
        </div>
      </>
    )}

    {session && screen === "card-themes" && (
      <>
        <Header title={t("card_bg")} onBack={() => setScreen("profile")} />
        <div className="page">
          <div className="bg-grid">
            {CARD_THEMES.map((th) => {
              const pic = th === "own" ? session.photo : cardBackground(th);
              return (
                <button
                  key={th}
                  type="button"
                  className={`bg-pick${session.theme === th ? " on" : ""}`}
                  aria-pressed={session.theme === th}
                  onClick={() => {
                    void saveProfile({ theme: th });
                    setScreen("profile");
                  }}
                >
                  <span className="bg-prev">{pic ? <img src={pic} alt="" loading="lazy" style={th === "own" ? { objectPosition: `center ${session.coverY ?? 50}%` } : undefined} /> : <i aria-hidden="true">＋</i>}</span>
                  <span className="bg-name">{t(`bg_${th}` as MsgKey)}</span>
                </button>
              );
            })}
          </div>
          <p className="hint" style={{ marginTop: 16, textAlign: "center" }}>{t("bg_own_hint")}</p>
        </div>
      </>
    )}
    </>
  );
}
