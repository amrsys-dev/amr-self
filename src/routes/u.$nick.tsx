import { createFileRoute } from "@tanstack/react-router";
import { detectLang, translate } from "@/lib/i18n.ts";
import { parseCardTheme } from "@/lib/card/visibility.ts";
import { getPublicCard } from "@/lib/card/public-card.ts";
import { CardHero } from "@/components/qr-card.tsx";
import { serviceName } from "@/components/contact-icons.tsx";
import { useEffect, useState } from "react";
import { addLocalSaved } from "@/lib/card/saved-local.ts";

export const Route = createFileRoute("/u/$nick")({
  loader: ({ params, location: loc }) => {
    const theme = new URL(loc.href, "https://amr.local").searchParams.get("t");
    return getPublicCard({ data: { nick: params.nick, theme } });
  },
  // Link preview in Telegram, WhatsApp and others: the card picture made by the owner's app
  // (name, photo, nick, services), else the face photo, else the AMR ID icon. Never the cover alone.
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    let origin = "";
    try {
      origin = new URL(loaderData.url).origin;
    } catch {
      origin = "";
    }
    const abs = (p: string) => (origin && p.startsWith("/") ? `${origin}${p}` : p);
    const services = loaderData.contacts.map((c) => serviceName(c.kind, (k) => translate("en", k))).join(" · ");
    const title = `${loaderData.displayName ? `${loaderData.displayName} · ` : ""}${loaderData.nick} · AMR ID`;
    const description = `AMR ID - digital business card${services ? ` · ${services}` : ""}`;
    const big = Boolean(loaderData.share);
    const image = abs(loaderData.share || loaderData.avatar || "/icons/id-512.png");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:site_name", content: "AMR ID" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: loaderData.url },
        { property: "og:image", content: image },
        ...(big
          ? [
              { property: "og:image:width", content: "1200" },
              { property: "og:image:height", content: "630" },
            ]
          : []),
        { name: "twitter:card", content: big ? "summary_large_image" : "summary" },
      ],
    };
  },
  component: PublicCardPage,
  notFoundComponent: () => (
    <div className="app dark">
      <div className="page auth">
        <h1>AMR ID</h1>
      </div>
    </div>
  ),
});

function PublicCardPage() {
  const data = Route.useLoaderData();
  const [lang] = useState(detectLang);
  const theme = parseCardTheme(data.theme);
  return (
    <div className={`app ${data.appearance === "light" ? "light" : "dark"} ds ds-emerald pubcard`}>
      <div className="page">
        <CardHero nick={data.nick} name={data.displayName} verified={data.verified} url={data.url} theme={theme} contacts={data.contacts} lang={lang} guest photo={data.photo} avatar={data.avatar} coverY={data.coverY} />
        <SaveToId nick={data.nick} lang={lang} />
      </div>
    </div>
  );
}

/**
 * 27.11.2026 (Мурад): одна кнопка «Сохранить в AMR ID» вместо файла контакта.
 * Вошёл в AMR ID → визитка сохраняется в «Мои контакты», можно отправить свою в ответ.
 * Не вошёл → визитка запоминается на телефоне и сразу открывается вход / создание AMR ID;
 * после входа она переносится в аккаунт сама.
 */
function SaveToId({ nick, lang }: { nick: string; lang: ReturnType<typeof detectLang> }) {
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void fetch("/api/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { nick?: string }).nick ?? null : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
  if (me === undefined || me === nick) return null;
  const save = async () => {
    if (me) {
      const r = await fetch("/api/me/saved", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nicks: [nick] }) });
      if (r.ok) setSaved(true);
      return;
    }
    addLocalSaved(nick);
    window.location.href = `/?from=${encodeURIComponent(nick)}`;
  };
  const sendMine = () => {
    if (!me) return;
    const url = `${window.location.origin}/u/${encodeURIComponent(me)}`;
    if (navigator.share) void navigator.share({ title: `${me} · AMR ID`, url }).catch(() => undefined);
    else void navigator.clipboard.writeText(url);
  };
  return (
    <div className="saveid">
      {saved ? (
        <>
          <p className="saveid-done">{t("saved_to_id")}</p>
          <button className="idbtn" type="button" onClick={sendMine}>{t("send_mine_back")}</button>
        </>
      ) : (
        <button className="idbtn primary" type="button" onClick={() => void save()}>{t("save_to_id")}</button>
      )}
    </div>
  );
}
