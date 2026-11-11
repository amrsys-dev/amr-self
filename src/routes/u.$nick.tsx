import { createFileRoute } from "@tanstack/react-router";
import { detectLang } from "@/lib/i18n.ts";
import { parseCardTheme } from "@/lib/card/visibility.ts";
import { getPublicCard } from "@/lib/card/public-card.ts";
import { CardHero } from "@/components/qr-card.tsx";
import { useState } from "react";

export const Route = createFileRoute("/u/$nick")({
  loader: ({ params, location: loc }) => {
    const theme = new URL(loc.href, "https://amr.local").searchParams.get("t");
    return getPublicCard({ data: { nick: params.nick, theme } });
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
  let domain = "";
  try {
    domain = new URL(data.url).host;
  } catch {
    domain = "";
  }
  return (
    <div className={`app dark skin-${theme}`}>
      <div className="hd pubhd">
        <div className="brand">
          <span className="monopl">
            <img className="mono" src="/amr-mono.png" alt="" />
          </span>
          <span className="appname">AMR ID</span>
        </div>
      </div>
      <div className="page">
        <CardHero nick={data.nick} url={data.url} theme={theme} contacts={data.contacts} lang={lang} guest domain={domain} />
      </div>
    </div>
  );
}
