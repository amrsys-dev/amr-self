import { createFileRoute } from "@tanstack/react-router";
import { IdApp } from "@/components/id-app.tsx";
import { siteHost } from "@/lib/site-host.ts";

// Link preview (WhatsApp, Telegram): the AMR ID card on id.amrsys.net, the SELF card on self.amrsys.net.
const PREVIEW = {
  id: { title: "AMR ID - один контакт на всю жизнь", description: "Цифровая визитка: телефон, мессенджеры и соцсети в одной постоянной ссылке и QR. Номер сменился - ссылка та же.", image: "https://id.amrsys.net/og-id.jpg", url: "https://id.amrsys.net/" },
  self: { title: "SELF - деньги, планы и машина в одном телефоне", description: "Личный помощник: баланс и расходы, задачи и тренировки, обслуживание машины. Вход через AMR ID, данные шифруются.", image: "https://self.amrsys.net/og-self.jpg", url: "https://self.amrsys.net/" },
} as const;

export const Route = createFileRoute("/")({
  loader: async () => ({ host: await siteHost() }),
  head: ({ loaderData }) => {
    const p = PREVIEW[loaderData?.host?.startsWith("self.") ? "self" : "id"];
    return {
      meta: [
        { title: p.title.split(" - ")[0] },
        { name: "description", content: p.description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "AMR Systems" },
        { property: "og:title", content: p.title },
        { property: "og:description", content: p.description },
        { property: "og:url", content: p.url },
        { property: "og:image", content: p.image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: p.image },
      ],
    };
  },
  component: () => <IdApp />,
});
