import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import type { CardTheme, PublicContact } from "./visibility.ts";

export type CardPayload = {
  nick: string;
  displayName?: string;
  theme: CardTheme;
  coverY?: number;
  appearance?: "dark" | "light";
  contacts: PublicContact[];
  photo?: string | null;
  avatar?: string | null;
  /** Link preview picture for chats (1200×630), when the owner's app has made one. */
  share?: string | null;
  url: string;
};

export const getPublicCard = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = (d ?? {}) as { nick?: string; theme?: string | null };
    if (!o.nick || typeof o.nick !== "string") throw new Error("nick");
    return { nick: o.nick, theme: o.theme ?? null };
  })
  .handler(async ({ data }): Promise<CardPayload> => {
    const { handlePublicCard } = await import("../auth/handlers.ts");
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const url = new URL(request.url);
    if (data.theme) url.searchParams.set("t", data.theme);
    const res = await handlePublicCard(new Request(url, request), data.nick);
    if (res.status === 404) throw notFound();
    return (await res.json()) as CardPayload;
  });
