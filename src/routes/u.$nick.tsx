import { createFileRoute } from "@tanstack/react-router";
import { detectLang, translate } from "@/lib/i18n.ts";
import { parseCardTheme } from "@/lib/card/visibility.ts";
import { getPublicCard } from "@/lib/card/public-card.ts";
import { buildVcard, vcardFileName } from "@/lib/card/vcard.ts";
import { CardHero } from "@/components/qr-card.tsx";
import { serviceName } from "@/components/contact-icons.tsx";
import { downloadBlob } from "@/components/app/use-id-app.ts";
import { useState } from "react";

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
    const description = `AMR ID — digital business card${services ? ` · ${services}` : ""}`;
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
  const saveContact = () => {
    const blob = new Blob([buildVcard({ nick: data.nick, name: data.displayName, url: data.url, contacts: data.contacts })], { type: "text/vcard" });
    downloadBlob(blob, vcardFileName(data.nick));
  };
  return (
    <div className={`app ${data.appearance === "light" ? "light" : "dark"} ds ds-emerald pubcard`}>
      <div className="page">
        <CardHero nick={data.nick} name={data.displayName} url={data.url} theme={theme} contacts={data.contacts} lang={lang} guest onVcard={saveContact} photo={data.photo} avatar={data.avatar} coverY={data.coverY} />
      </div>
    </div>
  );
}
